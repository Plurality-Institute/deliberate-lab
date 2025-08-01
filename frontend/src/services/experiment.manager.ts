import {computed, makeObservable, observable, action, runInAction} from 'mobx';
import {
  collection,
  onSnapshot,
  query,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import {AgentEditor} from './agent.editor';
import {AgentManager} from './agent.manager';
import {AuthService} from './auth.service';
import {CohortService} from './cohort.service';
import {ExperimentEditor} from './experiment.editor';
import {ExperimentService} from './experiment.service';
import {FirebaseService} from './firebase.service';
import {ParticipantService} from './participant.service';
import {Pages, RouterService} from './router.service';
import {Service} from './service';
import JSZip from 'jszip';

import {
  AlertMessage,
  AlertStatus,
  AgentPersonaConfig,
  AgentPersonaType,
  BaseAgentPromptConfig,
  ChatMessage,
  CohortConfig,
  CohortParticipantConfig,
  CreateChatMessageData,
  MediatorProfile,
  MetadataConfig,
  ParticipantProfileExtended,
  ParticipantStatus,
  ProfileAgentConfig,
  StageConfig,
  createCohortConfig,
  createExperimenterChatMessage,
  generateId,
} from '@deliberation-lab/utils';
import {
  ackAlertMessageCallable,
  bootParticipantCallable,
  createChatMessageCallable,
  createCohortCallable,
  createParticipantCallable,
  checkOrCreateParticipantCallable,
  deleteCohortCallable,
  deleteExperimentCallable,
  initiateParticipantTransferCallable,
  sendParticipantCheckCallable,
  setExperimentCohortLockCallable,
  testAgentConfigCallable,
  testAgentParticipantPromptCallable,
  updateCohortMetadataCallable,
  writeExperimentCallable,
} from '../shared/callables';
import {
  getCohortParticipants,
  hasMaxParticipantsInCohort,
} from '../shared/cohort.utils';
import {
  getChatHistoryData,
  getChipNegotiationCSV,
  getChipNegotiationData,
  getChipNegotiationPlayerMapCSV,
  getExperimentDownload,
  getParticipantData,
} from '../shared/file.utils';
import {
  isObsoleteParticipant,
  requiresAnonymousProfiles,
} from '../shared/participant.utils';

interface ServiceProvider {
  agentEditor: AgentEditor;
  agentManager: AgentManager;
  authService: AuthService;
  cohortService: CohortService;
  experimentEditor: ExperimentEditor;
  experimentService: ExperimentService;
  firebaseService: FirebaseService;
  participantService: ParticipantService;
  routerService: RouterService;
}

/**
 * Manages experiment cohorts and participants (experimenter view only).
 * - For experiment/stage/role configs, see experiment.service.ts
 * - For experiment editor, see experiment.editor.ts
 */
export class ExperimentManager extends Service {
  constructor(private readonly sp: ServiceProvider) {
    super();
    makeObservable(this);
  }

  // Experimenter-only data
  @observable experimentId: string | undefined = undefined;
  @observable cohortMap: Record<string, CohortConfig> = {};
  @observable agentPersonaMap: Record<string, AgentPersonaConfig> = {};
  @observable participantMap: Record<string, ParticipantProfileExtended> = {};
  @observable mediatorMap: Record<string, MediatorProfile> = {};
  @observable alertMap: Record<string, AlertMessage> = {};

  // Loading
  @observable unsubscribe: Unsubscribe[] = [];
  @observable isCohortsLoading = false;
  @observable isParticipantsLoading = false;
  @observable isMediatorsLoading = false;
  @observable isAgentsLoading = false;

  // Firestore loading (not included in general isLoading)
  @observable isWritingCohort = false;
  @observable isWritingParticipant = false;

  // Experiment edit state
  @observable isEditing = false; // is on an edit page
  @observable isEditingSettingsDialog = false; // is in settings dialog

  // Current participant, view in dashboard
  @observable currentParticipantId: string | undefined = undefined;
  @observable currentCohortId: string | undefined = undefined;
  @observable showCohortEditor = true;
  @observable showCohortList = true;
  @observable showParticipantStats = true;
  @observable showParticipantPreview = true;
  @observable hideLockedCohorts = false;
  @observable expandAllCohorts = true;

  // Copy of cohort being edited in settings dialog
  @observable cohortEditing: CohortConfig | undefined = undefined;

  @action
  async setIsEditing(isEditing: boolean, saveChanges = false) {
    if (!isEditing) {
      runInAction(() => {
        this.isEditing = false;
      });
      // If save changes, call updateExperiment
      if (saveChanges) {
        await this.sp.experimentEditor.updateExperiment();
      }
      // Reset experiment editor
      this.sp.experimentEditor.resetExperiment();
      // Reload current experiment to listen to updated changes
      if (this.experimentId) {
        this.sp.experimentService.loadExperiment(this.experimentId);
      }
    } else {
      // Load current experiment into editor
      const experiment = this.sp.experimentService.experiment;
      if (!experiment) return;

      const stages: StageConfig[] = [];
      experiment.stageIds.forEach((id) => {
        const stage = this.sp.experimentService.stageConfigMap[id];
        if (stage) stages.push(stage);
      });

      // Load agent configs from snapshot listener in agent service
      if (this.experimentId) {
        this.sp.agentEditor.setAgentData(
          await this.sp.agentManager.getAgentDataObjects(this.experimentId),
        );
      }

      this.sp.experimentEditor.loadExperiment(experiment, stages);
      runInAction(() => {
        this.isEditing = true;
      });
    }
  }

  @action
  async setIsEditingSettingsDialog(isEditing: boolean, saveChanges = false) {
    await this.setIsEditing(isEditing, saveChanges);
    runInAction(() => {
      this.isEditingSettingsDialog = isEditing;
    });
  }

  // Returns true if is creator OR admin
  @computed get isCreator() {
    return (
      this.sp.authService.userEmail ===
        this.sp.experimentService.experiment?.metadata.creator ||
      this.sp.authService.isAdmin ||
      !this.sp.experimentService.experiment
    );
  }

  // Can edit if (no cohorts exist AND is creator) OR new experiment
  @computed get canEditExperimentStages() {
    return (
      (this.isCreator && Object.keys(this.cohortMap).length === 0) ||
      this.sp.routerService.activePage === Pages.EXPERIMENT_CREATE
    );
  }

  // Is editing full experiment, not settings dialog
  @computed get isEditingFull() {
    return this.isEditing && !this.isEditingSettingsDialog;
  }

  @action
  reset() {
    this.experimentId = undefined;
    this.cohortMap = {};
    this.agentPersonaMap = {};
    this.participantMap = {};
    this.mediatorMap = {};
    this.alertMap = {};
    this.isEditing = false;
    this.isEditingSettingsDialog = false;
    this.currentParticipantId = undefined;
    this.currentCohortId = undefined;
    this.showCohortEditor = true;
    this.showCohortList = true;
    this.showParticipantStats = true;
    this.showParticipantPreview = true;
    this.hideLockedCohorts = false;
    this.expandAllCohorts = true;
    this.cohortEditing = undefined;
    this.unsubscribeAll();
  }

  getParticipantSearchResults(rawQuery: string) {
    const query = rawQuery.toLowerCase();

    return Object.values(this.participantMap).filter((participant) => {
      if (participant.publicId.includes(query)) return true;
      if (participant.privateId.includes(query)) return true;
      if (participant.name?.toLowerCase().includes(query)) return true;
      if (participant.prolificId?.includes(query)) return true;
      for (const key of Object.keys(participant.anonymousProfiles)) {
        const profile = participant.anonymousProfiles[key];
        if (
          profile &&
          `${profile.name} ${profile.repeat + 1}`.toLowerCase().includes(query)
        ) {
          return true;
        }
      }
      return false;
    });
  }

  @action
  setCohortEditing(cohort: CohortConfig | undefined) {
    this.cohortEditing = cohort;
  }

  @action
  setShowCohortEditor(showCohortEditor: boolean) {
    this.showCohortEditor = showCohortEditor;
  }

  @action
  setShowCohortList(showCohortList: boolean) {
    this.showCohortList = showCohortList;
  }

  @action
  setShowParticipantPreview(showParticipantPreview: boolean) {
    this.showParticipantPreview = showParticipantPreview;
  }

  @action
  setShowParticipantStats(showParticipantStats: boolean) {
    this.showParticipantStats = showParticipantStats;
  }

  @action
  setHideLockedCohorts(hideLockedCohorts: boolean) {
    this.hideLockedCohorts = hideLockedCohorts;
  }

  @action
  setExpandAllCohorts(expandAllCohorts: boolean) {
    this.expandAllCohorts = expandAllCohorts;
  }

  @action
  setCurrentCohortId(id: string | undefined) {
    this.currentCohortId = id;
  }

  setCurrentParticipantId(id: string | undefined) {
    this.currentParticipantId = id;
    // TODO: Update current cohort to match current participant's cohort?

    // Update participant service in order to load correct participant answers
    // (Note: This also updates participant answer service accordingly)
    if (this.experimentId && id) {
      this.sp.participantService.updateForRoute(this.experimentId, id);
    }
  }

  @computed get agentPersonas() {
    return Object.values(this.agentPersonaMap);
  }

  @computed get agentParticipantPersonas() {
    return this.agentPersonas.filter(
      (persona) => persona.type === AgentPersonaType.PARTICIPANT,
    );
  }

  @computed get currentParticipant() {
    if (!this.currentParticipantId) return null;
    return this.participantMap[this.currentParticipantId];
  }

  getCurrentParticipantCohort(participant: ParticipantProfileExtended) {
    return this.getCohort(
      participant.transferCohortId ?? participant.currentCohortId,
    );
  }

  getCohortAgentParticipants(cohortId: string) {
    return Object.values(this.participantMap).filter(
      (participant) =>
        participant.agentConfig && cohortId === participant.currentCohortId,
    );
  }

  getCohortHumanParticipants(cohortId: string) {
    return Object.values(this.participantMap).filter(
      (participant) =>
        !participant.agentConfig && cohortId === participant.currentCohortId,
    );
  }

  getCohortAgentMediators(cohortId: string) {
    return Object.values(this.mediatorMap).filter(
      (mediator) =>
        mediator.agentConfig && mediator.currentCohortId === cohortId,
    );
  }

  getNumExperimentParticipants(countObsoleteParticipants = true) {
    const participants = Object.values(this.participantMap);
    if (countObsoleteParticipants) {
      return participants.length;
    }

    return participants.filter(
      (participant) => !isObsoleteParticipant(participant),
    ).length;
  }

  // Get participants for specified cohort
  getCohortParticipants(cohortId: string, countObsoleteParticipants = true) {
    return getCohortParticipants(
      Object.values(this.participantMap),
      cohortId,
      countObsoleteParticipants,
    );
  }

  getCohort(id: string) {
    return this.cohortMap[id];
  }

  isFullCohort(cohort: CohortConfig) {
    return hasMaxParticipantsInCohort(
      cohort,
      Object.values(this.participantMap),
    );
  }

  @computed get availableCohorts() {
    return Object.values(this.cohortMap).filter(
      (cohort) => !this.isFullCohort(cohort),
    );
  }

  @computed get numCohorts() {
    return Object.keys(this.cohortMap).length;
  }

  @computed get cohortList() {
    if (this.hideLockedCohorts) {
      return Object.values(this.cohortMap).filter(
        (cohort) =>
          !this.sp.experimentService.experiment?.cohortLockMap[cohort.id],
      );
    }
    return Object.values(this.cohortMap);
  }

  @computed get hasNewAlerts() {
    return this.newAlerts.length > 0;
  }

  @computed get newAlerts() {
    return Object.values(this.alertMap).filter(
      (alert) => alert.status === AlertStatus.NEW,
    );
  }

  @computed get oldAlerts() {
    return Object.values(this.alertMap).filter(
      (alert) => alert.status !== AlertStatus.NEW,
    );
  }

  @computed get isLoading() {
    return (
      this.isCohortsLoading ||
      this.isParticipantsLoading ||
      this.isMediatorsLoading ||
      this.isAgentsLoading
    );
  }

  set isLoading(value: boolean) {
    runInAction(() => {
      this.isCohortsLoading = value;
      this.isParticipantsLoading = value;
      this.isMediatorsLoading = value;
      this.isAgentsLoading = value;
    });
  }

  updateForRoute(experimentId: string) {
    if (experimentId !== this.experimentId) {
      this.experimentId = experimentId;
      this.loadExperimentData(experimentId);
    }
  }

  loadExperimentData(id: string) {
    this.unsubscribeAll();
    this.isLoading = true;

    if (!this.sp.authService.isExperimenter) {
      return;
    }

    // Subscribe to alerts
    this.unsubscribe.push(
      onSnapshot(
        collection(
          this.sp.firebaseService.firestore,
          'experiments',
          id,
          'alerts',
        ),
        (snapshot) => {
          runInAction(() => {
            let changedDocs = snapshot.docChanges().map((change) => change.doc);
            if (changedDocs.length === 0) {
              changedDocs = snapshot.docs;
            }

            changedDocs.forEach((doc) => {
              const data = doc.data() as AlertMessage;
              this.alertMap[data.id] = data;
            });
          });
        },
      ),
    );

    // Subscribe to cohorts
    this.unsubscribe.push(
      onSnapshot(
        collection(
          this.sp.firebaseService.firestore,
          'experiments',
          id,
          'cohorts',
        ),
        (snapshot) => {
          runInAction(() => {
            let changedDocs = snapshot.docChanges().map((change) => change.doc);
            if (changedDocs.length === 0) {
              changedDocs = snapshot.docs;
            }

            changedDocs.forEach((doc) => {
              const data = doc.data() as CohortConfig;
              this.cohortMap[doc.id] = data;
            });

            this.isCohortsLoading = false;
          });
        },
      ),
    );

    // Subscribe to participants' private profiles
    this.unsubscribe.push(
      onSnapshot(
        query(
          collection(
            this.sp.firebaseService.firestore,
            'experiments',
            id,
            'participants',
          ),
          where('currentStatus', '!=', ParticipantStatus.DELETED),
        ),
        (snapshot) => {
          runInAction(() => {
            let changedDocs = snapshot.docChanges().map((change) => change.doc);
            if (changedDocs.length === 0) {
              changedDocs = snapshot.docs;
            }

            changedDocs.forEach((doc) => {
              const data = {
                agentConfig: null,
                ...doc.data(),
              } as ParticipantProfileExtended;
              this.participantMap[doc.id] = data;
            });

            this.isParticipantsLoading = false;
          });
        },
      ),
    );

    // Subscribe to mediators' private profiles
    this.unsubscribe.push(
      onSnapshot(
        query(
          collection(
            this.sp.firebaseService.firestore,
            'experiments',
            id,
            'mediators',
          ),
          where('currentStatus', '!=', ParticipantStatus.DELETED),
        ),
        (snapshot) => {
          runInAction(() => {
            let changedDocs = snapshot.docChanges().map((change) => change.doc);
            if (changedDocs.length === 0) {
              changedDocs = snapshot.docs;
            }

            changedDocs.forEach((doc) => {
              const data = {
                agentConfig: null,
                ...doc.data(),
              } as MediatorProfile;
              this.mediatorMap[doc.id] = data;
            });

            this.isMediatorsLoading = false;
          });
        },
      ),
    );

    // Subscribe to agent personas
    this.unsubscribe.push(
      onSnapshot(
        query(
          collection(
            this.sp.firebaseService.firestore,
            'experiments',
            id,
            'agents',
          ),
        ),
        (snapshot) => {
          runInAction(() => {
            let changedDocs = snapshot.docChanges().map((change) => change.doc);
            if (changedDocs.length === 0) {
              changedDocs = snapshot.docs;
            }

            changedDocs.forEach((doc) => {
              const data = doc.data() as AgentPersonaConfig;
              this.agentPersonaMap[doc.id] = data;
            });

            this.isAgentsLoading = false;
          });
        },
      ),
    );
  }

  @action
  unsubscribeAll() {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe = [];
    // Reset experiment data
    this.cohortMap = {};
    this.participantMap = {};
    this.mediatorMap = {};
    this.agentPersonaMap = {};
    this.alertMap = {};
  }

  // *********************************************************************** //
  // FIRESTORE                                                               //
  // *********************************************************************** //

  /** Set cohort lock. */
  async setCohortLock(cohortId: string, isLock: boolean) {
    const experiment = this.sp.experimentService.experiment;
    if (!experiment) return;
    await setExperimentCohortLockCallable(this.sp.firebaseService.functions, {
      experimentId: experiment.id,
      cohortId,
      isLock,
    });
  }

  /** Fork the current experiment. */
  // TODO: Add forkExperiment cloud function on backend
  // that takes in ID of experiment to fork (instead of experiment copy)
  async forkExperiment() {
    const experiment = this.sp.experimentService.experiment;
    if (!experiment) return;

    // Change ID (creator will be changed by cloud functions)
    experiment.id = generateId();
    experiment.metadata.name = `Copy of ${experiment.metadata.name}`;

    // Get ordered list of stages
    const stages: StageConfig[] = [];
    experiment.stageIds.forEach((id) => {
      const stage = this.sp.experimentService.stageConfigMap[id];
      if (stage) stages.push(stage);
    });

    let response = {};
    response = await writeExperimentCallable(
      this.sp.firebaseService.functions,
      {
        collectionName: 'experiments',
        experimentConfig: experiment,
        stageConfigs: stages,
        agentConfigs: this.sp.agentEditor.getAgentData(),
      },
    );

    // Route to new experiment and reload to update changes
    this.sp.routerService.navigate(Pages.EXPERIMENT, {
      experiment: experiment.id,
    });

    return response;
  }

  /** Deletes the current experiment.
   * @rights Creator of experiment
   */
  async deleteExperiment() {
    if (!this.experimentId || !this.isCreator) return;
    const response = await deleteExperimentCallable(
      this.sp.firebaseService.functions,
      {
        collectionName: 'experiments',
        experimentId: this.experimentId,
      },
    );
    this.isEditingSettingsDialog = false;
    this.sp.routerService.navigate(Pages.HOME);
    return response;
  }

  /** Deletes the specified cohort.
   * @rights Creator of experiment
   */
  async deleteCohort(cohortId: string) {
    if (!this.experimentId) return;
    const response = await deleteCohortCallable(
      this.sp.firebaseService.functions,
      {
        experimentId: this.experimentId,
        cohortId,
      },
    );
    this.loadExperimentData(this.experimentId);
    this.cohortEditing = undefined;
    return response;
  }

  /** Create a new cohort
   * @rights Experimenter
   */
  @action
  async createCohort(config: Partial<CohortConfig> = {}, name = '') {
    if (!this.sp.experimentService.experiment) return;

    this.isWritingCohort = true;
    const cohortConfig = createCohortConfig({
      participantConfig:
        this.sp.experimentService.experiment.defaultCohortConfig,
      ...config,
    });
    cohortConfig.metadata.name = name;

    let response = {};

    if (this.experimentId) {
      response = await createCohortCallable(this.sp.firebaseService.functions, {
        experimentId: this.experimentId,
        cohortConfig,
      });
    }
    this.isWritingCohort = false;
    return response;
  }

  /** Update existing cohort metadata
   * @rights Experimenter
   */
  @action
  async updateCohortMetadata(
    cohortId: string,
    metadata: MetadataConfig,
    participantConfig: CohortParticipantConfig,
    experimentalCondition?: string,
  ) {
    if (!this.sp.experimentService.experiment) return;

    this.isWritingCohort = true;
    let response = {};

    if (this.experimentId) {
      response = await updateCohortMetadataCallable(
        this.sp.firebaseService.functions,
        {
          experimentId: this.experimentId,
          cohortId,
          metadata,
          participantConfig,
          experimentalCondition,
        },
      );
    }
    this.isWritingCohort = false;
    return response;
  }

  /** Create human participant. */
  @action
  async createParticipant(
    cohortId: string,
    prolificId?: string,
    forceNew?: boolean,
  ): Promise<{
    exists?: boolean;
    participant?: ParticipantProfileExtended;
    id?: string;
  }> {
    this.isWritingParticipant = true;
    let response: {
      exists?: boolean;
      participant?: ParticipantProfileExtended;
      id?: string;
    } = {};

    if (this.experimentId) {
      const isAnonymous = requiresAnonymousProfiles(
        this.sp.experimentService.stages,
      );

      response = await checkOrCreateParticipantCallable(
        this.sp.firebaseService.functions,
        {
          experimentId: this.experimentId,
          cohortId,
          isAnonymous,
          prolificId: prolificId || undefined,
          forceNew: forceNew || false,
        },
      );
    }
    this.isWritingParticipant = false;
    return response;
  }

  /** Create agent participant. */
  @action
  async createAgentParticipant(
    cohortId: string,
    agentConfig: ProfileAgentConfig,
  ) {
    this.isWritingParticipant = true;
    let response = {};

    if (this.experimentId) {
      const isAnonymous = requiresAnonymousProfiles(
        this.sp.experimentService.stages,
      );

      response = await createParticipantCallable(
        this.sp.firebaseService.functions,
        {
          experimentId: this.experimentId,
          cohortId,
          isAnonymous,
          agentConfig,
        },
      );
    }
    this.isWritingParticipant = false;
    return response;
  }

  /** Send check to participant. */
  async sendCheckToParticipant(
    participantId: string,
    status: ParticipantStatus.ATTENTION_CHECK, // TODO: Add other checks
    customMessage = '',
  ) {
    if (!this.experimentId) {
      return;
    }

    await sendParticipantCheckCallable(this.sp.firebaseService.functions, {
      experimentId: this.experimentId,
      participantId,
      status,
      customMessage,
    });
  }

  /** Boot participant from experiment. */
  async bootParticipant(participantId: string) {
    if (!this.experimentId) return;
    await bootParticipantCallable(this.sp.firebaseService.functions, {
      experimentId: this.experimentId,
      participantId,
    });
  }

  /** Initiate participant transfer. */
  async initiateParticipantTransfer(participantId: string, cohortId: string) {
    if (this.experimentId) {
      await initiateParticipantTransferCallable(
        this.sp.firebaseService.functions,
        {
          experimentId: this.experimentId,
          cohortId,
          participantId,
        },
      );
    }
  }

  /** Download experiment as a zip file. */
  async downloadExperiment() {
    let data = {};
    const experimentId = this.sp.routerService.activeRoute.params['experiment'];
    if (experimentId) {
      const result = await getExperimentDownload(
        this.sp.firebaseService.firestore,
        experimentId,
      );

      if (result) {
        const zip = new JSZip();
        const experimentName = result.experiment.metadata.name;

        // Add experiment JSON to zip
        zip.file(`${experimentName}.json`, JSON.stringify(result, null, 2));

        // Add chip negotiation data
        const chipData = getChipNegotiationData(result);
        if (chipData.length > 0) {
          const chipDataTitle = `${experimentName}_ChipNegotiation_all`;
          zip.file(
            `${chipDataTitle}.json`,
            JSON.stringify({games: chipData}, null, 2),
          );
          zip.file(
            `${chipDataTitle}.csv`,
            new Blob(
              [
                getChipNegotiationCSV(result, chipData)
                  .map((row) => row.join(','))
                  .join('\n'),
              ],
              {type: 'text/csv'},
            ),
          );
          zip.file(
            `${experimentName}_ChipNegotiation_PlayerMap.csv`,
            new Blob(
              [
                getChipNegotiationPlayerMapCSV(result, chipData)
                  .map((row) => row.join(','))
                  .join('\n'),
              ],
              {type: 'text/csv'},
            ),
          );
        }

        // Add chat data to zip
        const chatData = getChatHistoryData(result);
        chatData.forEach((data) => {
          const chatFileName = `${data.experimentName}_ChatHistory_Cohort-${data.cohortId}_Stage-${data.stageId}.csv`;
          zip.file(
            chatFileName,
            new Blob([data.data.map((row) => row.join(',')).join('\n')], {
              type: 'text/csv',
            }),
          );
        });

        // Add participant data to zip
        zip.file(
          `${experimentName}_ParticipantData.csv`,
          new Blob(
            [
              getParticipantData(result)
                .map((row) => row.join(','))
                .join('\n'),
            ],
            {type: 'text/csv'},
          ),
        );

        // Generate zip and trigger download
        zip.generateAsync({type: 'blob'}).then((blob) => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `${experimentName}_data.zip`;
          link.click();
          URL.revokeObjectURL(link.href);
        });

        data = result;
      }
    }
    return data;
  }

  /** TEMPORARY: Test agent participant prompt for given participant/stage. */
  async testAgentParticipantPrompt(participantId: string, stageId: string) {
    if (this.experimentId) {
      await testAgentParticipantPromptCallable(
        this.sp.firebaseService.functions,
        {
          experimentId: this.experimentId,
          participantId,
          stageId,
        },
      );
    }
  }

  /** Test given agent config. */
  async testAgentConfig(
    agentConfig: AgentPersonaConfig,
    promptConfig: BaseAgentPromptConfig,
  ) {
    let response = '';
    const creatorId = this.sp.authService.experimenterData?.email;
    if (creatorId) {
      response =
        (
          await testAgentConfigCallable(this.sp.firebaseService.functions, {
            creatorId,
            agentConfig,
            promptConfig,
          })
        ).data ?? '';
    }
    return response;
  }

  /** Acknowledge alert message. */
  async ackAlertMessage(alertId: string, response = '') {
    let output = {};
    if (this.experimentId) {
      output = await ackAlertMessageCallable(
        this.sp.firebaseService.functions,
        {
          experimentId: this.experimentId,
          alertId,
          response,
        },
      );
    }
    return output;
  }

  /** Create a manual (human) agent chat message. */
  async createManualChatMessage(
    stageId: string,
    config: Partial<ChatMessage> = {},
  ) {
    let response = {};
    const experimentId = this.sp.routerService.activeRoute.params['experiment'];
    const cohortId = this.sp.cohortService.cohortId;

    if (experimentId && cohortId) {
      const chatMessage = createExperimenterChatMessage({
        ...config,
        discussionId: this.sp.cohortService.getChatDiscussionId(stageId),
      });

      const createData: CreateChatMessageData = {
        experimentId,
        cohortId,
        stageId,
        chatMessage,
      };

      response = await createChatMessageCallable(
        this.sp.firebaseService.functions,
        createData,
      );
    }

    return response;
  }
}
