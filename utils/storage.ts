
// utils/storage.ts

export const saveStateToLocalStorage = <T>(key: string, state: T): boolean => {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem(key, serializedState);
    return true;
  } catch (error: any) {
    if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      console.warn("LocalStorage quota exceeded. Attempting to save without large visual data...");
      // Fallback: If visuals exist, try saving without them to at least keep text data/history
      if (typeof state === 'object' && state !== null && 'visuals' in state) {
        try {
          const fallbackState = { ...state, visuals: {} };
          localStorage.setItem(key, JSON.stringify(fallbackState));
          return true;
        } catch (innerError) {
          console.error("Critical storage failure:", innerError);
        }
      }
    }
    console.error("Error saving state to localStorage:", error);
    return false;
  }
};

export const loadStateFromLocalStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const serializedState = localStorage.getItem(key);
    if (serializedState === null) {
      return defaultValue;
    }
    return JSON.parse(serializedState) as T;
  } catch (error) {
    console.error("Error loading state from localStorage:", error);
    return defaultValue;
  }
};

export const removeFromLocalStorage = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error("Error removing item from localStorage:", error);
  }
};
