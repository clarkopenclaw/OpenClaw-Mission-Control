import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import HomePage from '../features/cockpit/routes/HomePage';
import CronPage from '../features/cron/routes/CronPage';
import VoiceCapturePage from '../features/voice/routes/VoiceCapturePage';
import VoiceSessionPage from '../features/voice/routes/VoiceSessionPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'voice/new',
        element: <VoiceCapturePage />,
      },
      {
        path: 'voice/:sessionId',
        element: <VoiceSessionPage />,
      },
      {
        path: 'ops/cron',
        element: <CronPage />,
      },
    ],
  },
]);
