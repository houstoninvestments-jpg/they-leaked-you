import React from "react";
import { Composition } from "remotion";
import { BreachShort } from "./BreachShort";
import type { BreachProps } from "./props";
import { H, W } from "./layout";
import sample from "./sample-props.json";
export const Root: React.FC = () => (
  <Composition
    id="BreachShort"
    component={BreachShort}
    width={W}
    height={H}
    fps={30}
    durationInFrames={900}
    defaultProps={sample as unknown as BreachProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.timeline.total,
    })}
  />
);
