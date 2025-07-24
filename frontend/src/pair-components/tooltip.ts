import {CSSResultGroup, LitElement, html} from 'lit';

import {customElement, property, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {Ref, createRef, ref} from 'lit/directives/ref.js';
import {styleMap} from 'lit/directives/style-map.js';
import {styles as sharedStyles} from './shared.css';

import {styles} from './tooltip.css';

import type {ComponentColor} from './types';

/** Specifies tooltip position */
export const TOOLTIP_POSITIONS = [
  'TOP_START',
  'TOP',
  'TOP_END',
  'BOTTOM_START',
  'BOTTOM',
  'BOTTOM_END',
  'LEFT_START',
  'LEFT',
  'LEFT_END',
  'RIGHT_START',
  'RIGHT',
  'RIGHT_END',
];

/** Specifies tooltip position */
export type TooltipPosition = (typeof TOOLTIP_POSITIONS)[number];

/** Specifies display mode */
export type DisplayMode =
  | 'block'
  | 'inline'
  | 'inline-block'
  | 'flex'
  | 'inline-flex'
  | 'grid'
  | 'inline-grid'
  | 'flow-root';

const TOOLTIP_POSITIONS_OFFSET_DEFAULT = 4;
const TOOLTIP_DELAY_DEFAULT = 500; // in milliseconds
const TOOLTIP_DELAY_LONG = 1000;

/**
 * Renders a tooltip
 */
@customElement('pr-tooltip')
export class Tooltip extends LitElement {
  static override styles: CSSResultGroup = [sharedStyles, styles];

  // Component settings
  @property({type: String}) text = '';
  @property({type: Number}) delay = TOOLTIP_DELAY_DEFAULT; // in milliseconds
  @property({type: Boolean}) longDelay = false;

  @property({type: Boolean}) shouldRenderAriaLabel = true;
  @property({type: Boolean}) disabled = false;

  @property({type: Number}) positionOffset = TOOLTIP_POSITIONS_OFFSET_DEFAULT;
  @property() zIndex: number | undefined = undefined;
  @property() displayMode: DisplayMode | undefined = undefined;

  @property({type: String}) color: ComponentColor = 'neutral';
  @property({type: String}) position: TooltipPosition = 'TOP_START';

  private readonly tooltipRef: Ref<HTMLDivElement> = createRef();

  @state() left: number | undefined = undefined;
  @state() right: number | undefined = undefined;
  @state() top: number | undefined = undefined;
  @state() bottom: number | undefined = undefined;

  renderAriaLabel() {
    return this.shouldRenderAriaLabel ? html`aria-label=${this.text}` : '';
  }

  override firstUpdated() {
    requestAnimationFrame(() => this.updatePosition());
  }

  private updatePosition() {
    const tooltip = this.tooltipRef.value;
    if (!tooltip) return;

    const {width, height} = tooltip.getBoundingClientRect();
    let left, right, top, bottom;

    if (this.position === 'TOP_START') {
      left = 0;
      bottom = height + this.positionOffset;
    } else if (this.position === 'TOP_END') {
      right = 0;
      bottom = height + this.positionOffset;
    } else if (this.position === 'BOTTOM_START') {
      left = 0;
      top = height + this.positionOffset;
    } else if (this.position === 'BOTTOM_END') {
      right = 0;
      top = height + this.positionOffset;
    } else if (this.position === 'LEFT_START') {
      right = width + this.positionOffset;
      top = 0;
    } else if (this.position === 'LEFT_END') {
      right = width + this.positionOffset;
      bottom = 0;
    } else if (this.position === 'RIGHT_START') {
      left = width + this.positionOffset;
      top = 0;
    } else if (this.position === 'RIGHT_END') {
      left = width + this.positionOffset;
      bottom = 0;
    } else if (this.position === 'TOP') {
      left = width / 2;
      bottom = height + this.positionOffset;
    } else if (this.position === 'BOTTOM') {
      top = height + this.positionOffset;
      left = width / 2;
    } else if (this.position === 'LEFT') {
      right = width + this.positionOffset;
      top = height / 2;
    } else if (this.position === 'RIGHT') {
      left = width + this.positionOffset;
      top = height / 2;
    }

    // Only update state if changed
    if (this.left !== left) this.left = left;
    if (this.right !== right) this.right = right;
    if (this.top !== top) this.top = top;
    if (this.bottom !== bottom) this.bottom = bottom;
  }

  private getTooltipStyles() {
    const delay = this.longDelay ? TOOLTIP_DELAY_LONG : this.delay;

    const styleObject: {[key: string]: string} = {
      '--transition-delay': `${delay}ms`,
    };

    if (this.zIndex !== undefined) {
      styleObject['--z-index'] = `${this.zIndex}`;
    }

    if (this.displayMode !== undefined) {
      styleObject['--display-mode'] = this.displayMode;
    }

    const formatPixel = (value: number) => {
      return `${value}px`;
    };

    if (this.left !== undefined) {
      styleObject['--left'] = formatPixel(this.left);
    }
    if (this.right !== undefined) {
      styleObject['--right'] = formatPixel(this.right);
    }
    if (this.top !== undefined) {
      styleObject['--top'] = formatPixel(this.top);
    }
    if (this.bottom !== undefined) {
      styleObject['--bottom'] = formatPixel(this.bottom);
    }

    return styleMap(styleObject);
  }

  override render() {
    if (!this.text || this.disabled) return html`<slot></slot>`;

    const tooltipClasses = classMap({
      tooltip: true,
      'centered-horizontal':
        this.position === 'TOP' || this.position === 'BOTTOM',
      'centered-vertical':
        this.position === 'LEFT' || this.position === 'RIGHT',
    });

    return html`
      <div
        class=${tooltipClasses}
        @mouseenter=${() => {
          requestAnimationFrame(() => this.updatePosition());
        }}
        data-title=${this.text}
        style=${this.getTooltipStyles()}
        ${ref(this.tooltipRef)}
      >
        <slot> </slot>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pr-tooltip': Tooltip;
  }
}
