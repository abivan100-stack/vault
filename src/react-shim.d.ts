declare namespace JSX {
  type Element = unknown;
  interface IntrinsicElements {
    [elementName: string]: { [propertyName: string]: unknown };
  }
}

declare module "react" {
  export type SetStateAction<T> = T | ((previous: T) => T);
  export type Dispatch<T> = (value: T) => void;
  export function useState<T>(initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>];
  export function useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, dependencies: readonly unknown[]): T;
  export const StrictMode: (props: { children?: unknown }) => JSX.Element;
}

declare module "react-dom/client" {
  export function createRoot(container: Element | DocumentFragment): { render(children: unknown): void };
}

declare module "react/jsx-runtime" {
  export function jsx(type: unknown, props: unknown, key?: unknown): JSX.Element;
  export function jsxs(type: unknown, props: unknown, key?: unknown): JSX.Element;
  export const Fragment: (props: { children?: unknown }) => JSX.Element;
}
