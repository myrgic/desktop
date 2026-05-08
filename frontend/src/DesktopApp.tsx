/**
 * Desktop App - Wails frontend entry point
 *
 * Wraps ui-core with native plugins (terminal, desktop settings).
 * Provides the full CogOS UI with native macOS integrations.
 */
import { Provider } from 'jotai'
import {
  PluginProvider,
  PluginNavigation,
  PluginViews,
  SessionProvider,
  store,
  setKernelUrl,
} from '@cogos/ui-core'
import { terminalPlugin } from './plugins/TerminalPlugin'
import { desktopSettingsPlugin } from './plugins/DesktopSettingsPlugin'

// Import ui-core styles
import '@cogos/ui-core/styles.css'

// Configure kernel URL (local by default)
setKernelUrl('http://localhost:6931')

/**
 * DesktopApp - Main desktop application component
 *
 * Combines ui-core plugins with native desktop plugins:
 * - Terminal (native PTY via Wails)
 * - All ui-core plugins (chat, memory-graph, coherence, etc.)
 * - Desktop Settings (launchctl service controls)
 */
export function DesktopApp() {
  return (
    <Provider store={store}>
      <SessionProvider>
        <PluginProvider
          config={{
            kernelUrl: 'http://localhost:6931',
            plugins: [terminalPlugin, desktopSettingsPlugin],
          }}
          defaultView="terminal"
        >
          <div className="flex flex-col h-screen bg-gray-900">
            <PluginNavigation />
            <PluginViews />
          </div>
        </PluginProvider>
      </SessionProvider>
    </Provider>
  )
}

export default DesktopApp
