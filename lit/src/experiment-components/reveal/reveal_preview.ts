import "../footer/footer";
import "../progress/progress_stage_completed";
import "../election/election_reveal";
import "../games/lost_at_sea/las_result";

import { MobxLitElement } from "@adobe/lit-mobx";
import { CSSResultGroup, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

import {
  RevealStageConfig,
  StageKind
} from "@llm-mediation-experiments/utils";

import { core } from "../../core/core";
import { ExperimentService } from "../../services/experiment_service";
import { ParticipantService } from "../../services/participant_service";

import { styles } from "./reveal_preview.scss";

/** Reveal preview */
@customElement("reveal-preview")
export class RevealPreview extends MobxLitElement {
  static override styles: CSSResultGroup = [styles];

  private readonly experimentService = core.getService(ExperimentService);
  private readonly participantService = core.getService(ParticipantService);

  @property() stage: RevealStageConfig|null = null;

  override render() {
    return html`
      <div class="description">${this.stage?.description}</div>

      <div class="stages-wrapper">
        ${this.stage?.stagesToReveal.map(stage => this.renderStageReveal(stage))}
      </div>
      <stage-footer .disabled=${!this.participantService.isCurrentStage()}>
        <progress-stage-completed></progress-stage-completed>
      </stage-footer>
    `;
  }

  private renderStageReveal(stageId: string) {
    const stage = this.experimentService.stageConfigMap[stageId];
    if (stage === undefined) {
      return nothing;
    }

    switch (stage.kind) {
      case StageKind.VoteForLeader:
        return html`<election-reveal .voteStageId=${stage.id}></election-reveal`;
      case StageKind.TakeSurvey:
        const answer = this.participantService.stageAnswers[stage.id];
        return html`<las-survey-results .stage=${stage} .answer=${answer}></las-survey-results>`;
      default:
        return nothing;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "reveal-preview": RevealPreview;
  }
}
