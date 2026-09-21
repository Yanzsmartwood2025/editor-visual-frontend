declare module 'react-native' {
  import type * as React from 'react';
  export type NodeHandle = number;
  export type ViewComponent = React.ComponentType<ViewProps>;
  export type LayoutChangeEvent = {
    nativeEvent: {
      layout: { x: number; y: number; width: number; height: number };
    };
  };
  export type MeasureOnSuccessCallback = (
    x: number,
    y: number,
    width: number,
    height: number,
    pageX: number,
    pageY: number
  ) => void;
  export type MeasureInWindowOnSuccessCallback = (
    x: number,
    y: number,
    width: number,
    height: number
  ) => void;
  export interface ViewProps {
    children?: React.ReactNode;
    style?: React.CSSProperties | React.CSSProperties[];
    onLayout?: (event: LayoutChangeEvent) => void;
    pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
    [key: string]: unknown;
  }
  export class View extends React.Component<ViewProps> {
    measure(callback: MeasureOnSuccessCallback): void;
    measureInWindow(callback: MeasureInWindowOnSuccessCallback): void;
  }
  export const Platform: { OS: string };
  export const PixelRatio: { get(): number };
  export const Image: {
    resolveAssetSource(source: unknown): { uri: string };
  };
  export const findNodeHandle: (value: unknown) => NodeHandle | null;
  export const TurboModuleRegistry: {
    getEnforcing<T>(name: string): T;
  };
  export const codegenNativeComponent: <T extends ViewProps>(
    name: string
  ) => React.ComponentType<T>;
}

declare module 'react-native/Libraries/TurboModule/RCTExport' {
  export interface TurboModule {}
}

declare module 'react-native/Libraries/Types/CodegenTypes' {
  export type WithDefault<T, _Default> = T;
}


declare module 'react-native-reanimated' {
  export interface SharedValue<T = unknown> {
    value: T;
    [key: string]: unknown;
  }
  export interface FrameInfo {
    timestamp: number;
    timeSincePreviousFrame?: number | null;
    timeSinceFirstFrame?: number;
  }
  export type ExtrapolationType = 'extend' | 'clamp' | 'identity';
  export type WorkletRuntime = unknown;
  export const useSharedValue: <T>(value: T) => SharedValue<T>;
  export const useDerivedValue: (...args: any[]) => any;
  export const useFrameCallback: (...args: any[]) => any;
  export const useAnimatedRef: (...args: any[]) => any;
  export const measure: (...args: any[]) => any;
  export const runOnJS: (...args: any[]) => any;
  export const runOnRuntime: (...args: any[]) => any;
  export const createWorkletRuntime: (...args: any[]) => any;
  const Reanimated: Record<string, any>;
  export default Reanimated;
}

declare module 'react-native-worklets' {
  export type WorkletFunction<T extends (...args: any[]) => any = (...args: any[]) => any> = T;
}
