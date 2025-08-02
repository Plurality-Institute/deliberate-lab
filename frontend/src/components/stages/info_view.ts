import {shuffle} from 'seed-shuffle';
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
    const participantPublicId = this.participantService.profile?.publicId ?? '';
    // participantShortId: last three sections of the guid, separated by dashes
    let participantShortId = '';
    if (participantPrivateId) {
      const parts = participantPrivateId.split('-');
      if (parts.length >= 2) {
        participantShortId = parts.slice(-2).join('-');
      } else {
        participantShortId = participantPrivateId;
      }
    }
    let infoLinesJoined = '';

    // If infoTextsRandomized is present, pick one entry at random, seeded by userId
    if (
      this.stage.infoTextsRandomized &&
      this.stage.infoTextsRandomized.length > 0
    ) {
      if (!this.participantService.participantId) {
        console.error(
          'Info stage randomization requires participantId to be set.',
        );
        return nothing; // better to fail than silently show incorrect order
      }

      const seedStr = this.participantService.participantId + this.stage.id;
      const seed = Array.from(seedStr).reduce(
        (acc, char) => acc + char.charCodeAt(0),
        0,
      );
      const shuffled: string[] = shuffle(
        this.stage.infoTextsRandomized.slice(),
        seed,
      );
      const selected: string =
        Array.isArray(shuffled) && shuffled.length > 0 ? shuffled[0] : '';
      infoLinesJoined = selected.replaceAll('\n', '\n\n'); // I guess we want double newlines?
    } else {
      infoLinesJoined = this.stage?.infoLines.join('\n\n') ?? '';
    }
    infoLinesJoined = infoLinesJoined.replaceAll(
      '{{participantPrivateId}}',
      participantPrivateId,
    );
    infoLinesJoined = infoLinesJoined.replaceAll(
      '{{participantPublicId}}',
      participantPublicId,
    );
    infoLinesJoined = infoLinesJoined.replaceAll(
      '{{participantShortId}}',
      participantShortId,
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
