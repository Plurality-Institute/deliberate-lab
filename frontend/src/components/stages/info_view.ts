import '../progress/progress_stage_completed';

import './stage_description';
import './stage_footer';

import {MobxLitElement} from '@adobe/lit-mobx';
import {CSSResultGroup, html, nothing} from 'lit';
import {customElement, property} from 'lit/decorators.js';

import {InfoStageConfig} from '@deliberation-lab/utils';

import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {convertMarkdownToHTML} from '../../shared/utils';
import {styles} from './info_view.scss';
import {core} from '../../core/core';
import {ParticipantService} from '../../services/participant.service';

/** Info stage view for participants. */
@customElement('info-view')
export class InfoView extends MobxLitElement {
  static override styles: CSSResultGroup = [styles];

  private readonly participantService = core.getService(ParticipantService);

  @property() stage: InfoStageConfig | null = null;

  override render() {
    if (!this.stage) {
      return nothing;
    }

    const participantPrivateId =
      this.participantService.profile?.privateId ?? '';
    let infoLinesJoined = this.stage?.infoLines.join('\n\n') ?? '';
    infoLinesJoined = infoLinesJoined.replaceAll(
      '{{participantPrivateId}}',
      participantPrivateId,
    );
    return html`
      <stage-description .stage=${this.stage}></stage-description>
      <div class="html-wrapper">
        <div class="info-block">
          ${unsafeHTML(convertMarkdownToHTML(infoLinesJoined))}
        </div>
      </div>
      <stage-footer>
        ${this.stage.progress.showParticipantProgress
          ? html`<progress-stage-completed></progress-stage-completed>`
          : nothing}
      </stage-footer>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'info-view': InfoView;
  }
}
