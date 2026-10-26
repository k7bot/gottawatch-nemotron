declare module 'react-native-pixel-perfect' {
  export function create(design: { width: number; height: number }): (px: number) => number;
}
