import {Type, type Static} from '@sinclair/typebox';
import {StageKind} from './stage';
import {
  StageGameSchema,
  StageProgressConfigSchema,
  StageTextConfigSchema,
} from './stage.validation';

/** Shorthand for strict TypeBox object validation */
const strict = {additionalProperties: false} as const;

// ************************************************************************* //
// writeExperiment, updateStageConfig endpoints                              //
// ************************************************************************* //

/** InfoStageConfig input validation. */
export const InfoStageConfigData = Type.Object(
  {
    id: Type.String({minLength: 1}),
    kind: Type.Literal(StageKind.INFO),
    game: StageGameSchema,
    name: Type.String({minLength: 1}),
    descriptions: StageTextConfigSchema,
    progress: StageProgressConfigSchema,
    infoLines: Type.Array(Type.String()),
    infoTextsRandomized: Type.Optional(
      Type.Array(Type.String(), {minLength: 1}),
    ),
  },
  strict,
);
