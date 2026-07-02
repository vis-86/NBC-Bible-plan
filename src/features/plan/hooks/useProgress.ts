import { usePlanContext } from '../contexts/PlanContext';

export function useProgress(_props?: any) {
  const { toggleItem, toggleComplete, toggleCompleteMany, isPending } = usePlanContext();

  return {
    toggleItem,
    toggleComplete,
    toggleCompleteMany,
    isPending
  };
}
