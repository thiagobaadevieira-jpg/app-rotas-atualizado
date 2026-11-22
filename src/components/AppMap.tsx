import {LeafletMap} from './LeafletMap.tsx';
import type {AppMapProps} from './LeafletMap.tsx';

export type {AppMapProps};

export function AppMap(props: AppMapProps) {
  return <LeafletMap {...props} />;
}
