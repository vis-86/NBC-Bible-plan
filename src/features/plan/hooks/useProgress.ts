import { usePlanContext } from '../contexts/PlanContext';

export function useProgress(_props?: any) {
  const { toggleItem, toggleComplete, isPending } = usePlanContext();

  return {
    toggleItem,
    toggleComplete,
    isPending
  };
}
