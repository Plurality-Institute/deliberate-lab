import '../../pair-components/button';
import '../../pair-components/tooltip';
import '../progress/progress_stage_completed';
import './stage_description';
import './stage_footer';

import {MobxLitElement} from '@adobe/lit-mobx';
import {CSSResultGroup, html, nothing} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';

import {core} from '../../core/core';
import {CohortService} from '../../services/cohort.service';
import {ParticipantService} from '../../services/participant.service';
import {
  SALESPERSON_ROLE_CONTROLLER_ID,
  SALESPERSON_ROLE_RESPONDER_ID,
  SalespersonBoardCellStatus,
  SalespersonBoardCellView,
  SalespersonMoveStatus,
  SalespersonStageConfig,
  SalespersonStagePublicData,
  StageKind,
  buildBoardView,
} from '@deliberation-lab/utils';
import {convertUnifiedTimestampToDate} from '../../shared/utils';

import {styles} from './salesperson_view.scss';

/** Salesperson stage view for participants. */
@customElement('salesperson-participant-view')
export class SalespersonView extends MobxLitElement {
  static override styles: CSSResultGroup = [styles];

  private readonly cohortService = core.getService(CohortService);
  private readonly participantService = core.getService(ParticipantService);

  @property() stage: SalespersonStageConfig | null = null;
  @state() proposedRow: number | null = null;
  @state() proposedColumn: number | null = null;

  override render() {
    if (!this.stage) {
      return nothing;
    }

    const publicData = this.cohortService.stagePublicDataMap[this.stage.id];
    if (!publicData || publicData.kind !== StageKind.SALESPERSON) {
      return nothing;
    }

    return html`
      <stage-description .stage=${this.stage}></stage-description>
      <div class="panel-wrapper">
        ${this.renderStartGamePanel(publicData)}
        ${this.renderControllerPanel(publicData)}
        ${this.renderResponderPanel(publicData)}
        ${this.renderGameOverPanel(publicData)}
      </div>
      <stage-footer .disabled=${!publicData.isGameOver}>
        ${this.stage.progress.showParticipantProgress
          ? html`<progress-stage-completed></progress-stage-completed>`
          : nothing}
      </stage-footer>
    `;
  }

  private renderGameOverPanel(publicData: SalespersonStagePublicData) {
    if (!publicData.isGameOver) {
      return nothing;
    }
    return html`
      <div class="panel">
        <div class="status-wrapper"><div>Game over!</div></div>
        ${this.renderBoard(publicData)}
      </div>
    `;
  }

  private renderStartGamePanel(publicData: SalespersonStagePublicData) {
    if (publicData.controller.length > 0 || publicData.isGameOver) {
      return nothing;
    }

    const onClick = () => {
      if (!this.stage) return;
      this.participantService.setSalespersonController(this.stage.id);
    };

    return html`
      <div class="panel">
        <pr-button @click=${onClick}>Start game</pr-button>
        ${this.renderBoard(publicData)}
      </div>
    `;
  }

  private renderControllerPanel(publicData: SalespersonStagePublicData) {
    if (publicData.controller === '' || publicData.isGameOver) {
      return nothing;
    }

    const participantId = this.participantService.profile?.publicId;
    if (publicData.controller !== participantId) {
      return nothing;
    }

    const onClick = async () => {
      if (
        !this.stage ||
        this.proposedRow === null ||
        this.proposedColumn === null
      )
        return;
      await this.participantService.setSalespersonMove(
        this.stage.id,
        this.proposedRow,
        this.proposedColumn,
      );
      this.proposedRow = null;
      this.proposedColumn = null;
    };

    const onReset = () => {
      this.proposedRow = null;
      this.proposedColumn = null;
    };

    return html`
      <div class="panel">
        <div class="status-wrapper">
          ${publicData.numMoves < publicData.moveHistory.length
            ? html`<div>Waiting for other player to respond...</div>`
            : html`<div>Your turn: Select and submit a valid move</div>`}
          <div class="button-wrapper">
            <pr-button
              @click=${onClick}
              ?disabled=${this.proposedRow === null ||
              this.proposedColumn === null}
            >
              Propose selected move
            </pr-button>
            <pr-button
              variant="default"
              @click=${onReset}
              ?disabled=${this.proposedRow === null ||
              this.proposedColumn === null}
            >
              Reset selection
            </pr-button>
          </div>
        </div>
        ${this.renderBoard(publicData)}
      </div>
    `;
  }

  private renderResponderPanel(publicData: SalespersonStagePublicData) {
    if (publicData.controller === '' || publicData.isGameOver) {
      return nothing;
    }

    const participantId = this.participantService.profile?.publicId;
    if (publicData.controller === participantId) {
      return nothing;
    }
    return html`
      <div class="panel">
        <div class="status-wrapper">
          ${this.renderProposedMove(publicData, true)}
        </div>
        ${this.renderBoard(publicData)}
      </div>
    `;
  }

  private renderProposedMove(
    publicData: SalespersonStagePublicData,
    showResponseButtons = false,
  ) {
    const moveHistory = publicData.moveHistory;
    if (publicData.numMoves === moveHistory.length) {
      return html`Waiting on proposal...`;
    }
    const currentMove = moveHistory[moveHistory.length - 1];
    return html`
      <div>Proposed move: ${JSON.stringify(currentMove.proposedCoord)}</div>
      ${showResponseButtons ? this.renderResponseButtons() : nothing}
    `;
  }

  private renderResponseButtons() {
    const onAccept = () => {
      if (!this.stage) return;
      this.participantService.setSalespersonResponse(this.stage.id, true);
    };
    const onReject = () => {
      if (!this.stage) return;
      this.participantService.setSalespersonResponse(this.stage.id, false);
    };

    return html`
      <div class="button-wrapper">
        <pr-button @click=${onAccept}>Accept move</pr-button>
        <pr-button color="error" @click=${onReject}>Reject move</pr-button>
      </div>
    `;
  }

  private renderBoard(publicData: SalespersonStagePublicData) {
    if (!this.stage) return;

    const participantId = this.participantService.profile?.publicId;
    const isController = publicData.controller === participantId;
    const isPending = publicData.numMoves < publicData.moveHistory.length;
    const role = isController
      ? SALESPERSON_ROLE_CONTROLLER_ID
      : SALESPERSON_ROLE_RESPONDER_ID;
    const board = buildBoardView(
      this.stage.board,
      role,
      publicData.moveHistory,
    );

    const renderBoardRow = (row: SalespersonBoardCellView[]) => {
      return html`
        <div class="table-row">
          ${row.map((cell) =>
            this.renderBoardCell(cell, isController && !isPending),
          )}
        </div>
      `;
    };

    const reachedExit = () => {
      if (!this.stage) return false;
      const endCoord = this.stage.board.endCoord;
      return publicData.moveHistory.find(
        (move) =>
          move.proposedCoord.row === endCoord.row &&
          move.proposedCoord.column === endCoord.column &&
          move.status === SalespersonMoveStatus.ACCEPTED,
      )
        ? true
        : false;
    };

    return html`
      <div class="table">${board.map((row) => renderBoardRow(row))}</div>
      <div class="board-logs">
        <div>Number of moves made: ${publicData.numMoves}</div>
        <div>
          Number of coins collected: ${publicData.coinsCollected.length}
        </div>
        <div>Reached exit? ${reachedExit()}</div>
      </div>
      <div class="board-logs">
        <div>Move history:</div>
        ${publicData.moveHistory.map(
          (move) =>
            html`<div>
              ${JSON.stringify(move.proposedCoord)}: ${move.status}
            </div>`,
        )}
      </div>
    `;
  }

  private renderBoardCell(cell: SalespersonBoardCellView, canClick = false) {
    const classes = classMap({
      'table-cell': true,
      eligible: cell.canMove && canClick,
      proposed:
        cell.status === SalespersonBoardCellStatus.PROPOSED ||
        (canClick &&
          cell.row === this.proposedRow &&
          cell.column === this.proposedColumn),
      current: cell.status === SalespersonBoardCellStatus.CURRENT,
    });

    const onClick = () => {
      if (
        cell.status === SalespersonBoardCellStatus.CURRENT ||
        !canClick ||
        !cell.canMove
      ) {
        return;
      }
      this.proposedRow = cell.row;
      this.proposedColumn = cell.column;
    };

    return html`
      <div class=${classes} role="button" @click=${onClick}>
        ${cell.content}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'salesperson-participant-view': SalespersonView;
  }
}
