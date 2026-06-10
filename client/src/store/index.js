import { configureStore } from '@reduxjs/toolkit';
import simulatorReducer from './simulatorSlice';

export const store = configureStore({
  reducer: {
    simulator: simulatorReducer,
  },
});
