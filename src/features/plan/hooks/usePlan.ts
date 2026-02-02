import { usePlanContext } from '../contexts/PlanContext';

export function usePlan() {
  const { 
    plan, 
    readChapters, 
    loading, 
    error, 
    fetchPlan, 
    setPlan, 
    setReadChapters 
  } = usePlanContext();

  return {
    plan,
    readChapters,
    loading,
    error,
    fetchPlan,
    setPlan,
    setReadChapters
  };
}
