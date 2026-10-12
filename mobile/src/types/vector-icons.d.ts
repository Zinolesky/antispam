declare module 'react-native-vector-icons' {
  import { ComponentType } from 'react';
  import { TextProps } from 'react-native';

  export interface IconProps extends TextProps {
    name: string;
    size?: number;
    color?: string;
  }

  export function createIconSet(
    glyphMap: Record<string, number>,
    fontFamily: string,
    fontFile?: string,
  ): ComponentType<IconProps>;
}
