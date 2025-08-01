import {computed, makeObservable, observable, action, runInAction} from 'mobx';
import {
  Auth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';

import {Service} from './service';
import {AdminService} from './admin.service';
import {FirebaseService} from './firebase.service';
import {HomeService} from './home.service';
import {ExperimentManager} from './experiment.manager';

import {
  ExperimenterProfile,
  ExperimenterData,
  createExperimenterData,
} from '@deliberation-lab/utils';

interface ServiceProvider {
  adminService: AdminService;
  experimentManager: ExperimentManager;
  firebaseService: FirebaseService;
  homeService: HomeService;
}

export class AuthService extends Service {
  constructor(private readonly sp: ServiceProvider) {
    super();
    makeObservable(this);

    onAuthStateChanged(
      this.sp.firebaseService.auth,
      async (user: User | null) => {
        if (user) {
          // User is signed in, see docs for a list of available properties
          // https://firebase.google.com/docs/reference/js/auth.user
          runInAction(() => {
            this.user = user;
          });

          const allowlistDoc = await getDoc(
            doc(
              this.sp.firebaseService.firestore,
              'allowlist',
              user.email ?? '',
            ),
          );

          runInAction(() => {
            if (allowlistDoc.exists()) {
              this.isExperimenter = true;
              this.subscribe();
              this.writeExperimenterProfile(user);
              this.sp.homeService.subscribe();
              const experimentId = this.sp.experimentManager.experimentId;
              if (experimentId) {
                this.sp.experimentManager.loadExperimentData(experimentId);
              }

              // Check if admin
              if (allowlistDoc.data().isAdmin) {
                this.sp.adminService.subscribe();
                this.isAdmin = true;
              } else {
                this.isAdmin = false;
              }
            } else {
              this.isExperimenter = false;
              this.isAdmin = false;
            }
          });
        } else {
          // User is signed out
          runInAction(() => {
            this.user = null;
            this.isExperimenter = null;
          });
        }
      },
    );
  }

  @observable user: User | null | undefined = undefined;
  @observable isAdmin: boolean | null = null;
  @observable isExperimenter: boolean | null = null;
  @observable canEdit = false;

  @observable private debugMode = true;

  @observable unsubscribe: Unsubscribe[] = [];
  @observable experimenterData: ExperimenterData | null = null;
  @observable isExperimentDataLoading = false;

  @computed get userId() {
    return this.user?.uid;
  }

  @computed get userEmail() {
    return this.user?.email;
  }

  @computed get initialAuthCheck() {
    return this.user !== undefined;
  }

  @computed get authenticated() {
    return this.initialAuthCheck && this.user !== null;
  }

  // If true and is experimenter, show debugging components
  // in experimenter preview
  @computed get isDebugMode() {
    return this.isExperimenter && this.debugMode;
  }

  @action
  setDebugMode(debugMode: boolean) {
    this.debugMode = debugMode;
  }

  @action
  subscribe() {
    this.unsubscribeAll();
    this.isExperimentDataLoading = true;

    // Subscribe to user's experimenter data
    if (!this.userId || !this.userEmail) return;
    this.unsubscribe.push(
      onSnapshot(
        doc(
          this.sp.firebaseService.firestore,
          'experimenterData',
          this.userEmail,
        ),
        (doc) => {
          runInAction(() => {
            if (!doc.exists()) {
              this.writeExperimenterData(
                createExperimenterData(this.userId!, this.userEmail!),
              );
            } else {
              const viewedExperiments: string[] = [];
              this.experimenterData = {
                viewedExperiments, // backwards compatibility
                ...doc.data(),
              } as ExperimenterData;
            }
            this.isExperimentDataLoading = false;
          });
        },
      ),
    );
  }

  @action
  unsubscribeAll() {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe = [];
    this.experimenterData = null;
  }

  @action
  setEditPermissions(canEdit: boolean) {
    this.canEdit = !this.isExperimenter ? false : canEdit;
  }

  signInWithGoogle() {
    signInWithPopup(
      this.sp.firebaseService.auth,
      this.sp.firebaseService.provider,
    );
  }

  signOut() {
    signOut(this.sp.firebaseService.auth);
    this.sp.homeService.unsubscribeAll();
  }

  /** Experimenter has viewed this experiment before. */
  isViewedExperiment(experimentId: string) {
    return this.experimenterData?.viewedExperiments.find(
      (experiment) => experiment === experimentId,
    );
  }

  /** Update viewed experiments list in ExperimenterData. */
  updateViewedExperiments(experimentId: string) {
    if (!this.experimenterData) {
      return;
    }

    const viewedExperiments = this.experimenterData.viewedExperiments;
    if (viewedExperiments.find((experiment) => experiment === experimentId)) {
      return;
    }

    this.writeExperimenterData({
      ...this.experimenterData,
      viewedExperiments: [...viewedExperiments, experimentId],
    });
  }

  // *********************************************************************** //
  // FIRESTORE                                                               //
  // *********************************************************************** //

  /** Update experimenter profile. */
  async writeExperimenterProfile(user: User) {
    const profile: ExperimenterProfile = {
      name: user.displayName ?? '',
      email: user.email ?? '',
      lastLogin: Timestamp.now(),
    };

    setDoc(
      doc(this.sp.firebaseService.firestore, 'experimenters', profile.email),
      profile,
    );
  }

  /** Update experimenter private data, e.g., API key. */
  async writeExperimenterData(data: ExperimenterData) {
    setDoc(
      doc(this.sp.firebaseService.firestore, 'experimenterData', data.email),
      data,
    );
  }
}
