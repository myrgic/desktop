/**
 * Desktop Settings Plugin
 *
 * Native settings plugin with launchctl service controls.
 * Only available in the desktop app (not web).
 */
import { useState, useEffect, useCallback } from 'react'
import { Settings, RefreshCw, Play, Square, RotateCcw, Check, X, AlertCircle } from 'lucide-react'
import type { Plugin } from '@cogos/ui-core'
import {
  GetServices,
  GetWorkspaceRoot,
  RestartService,
  StartService,
  StopService,
  EnableService,
  GetKernelStatus,
} from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'

type ServiceStatus = main.ServiceStatus

type KernelStatusDisplay = {
  processState: string
  coherenceStatus: string
  fieldSize: string
  offline: boolean
}

/**
 * Desktop Settings view with service controls
 */
function DesktopSettingsView() {
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [debugMode, setDebugMode] = useState(false)
  const [debugLoading, setDebugLoading] = useState(true)
  const [kernelStatus, setKernelStatus] = useState<KernelStatusDisplay>({
    processState: 'Offline',
    coherenceStatus: 'Offline',
    fieldSize: 'Offline',
    offline: true,
  })

  const KERNEL_URL = 'http://localhost:6931'

  const refreshServices = useCallback(async () => {
    try {
      const svcs = await GetServices()
      setServices(svcs)
    } catch (err) {
      console.error('Failed to get services:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const readValue = (obj: any, paths: string[][]): string | undefined => {
    for (const path of paths) {
      let current = obj
      let found = true
      for (const key of path) {
        if (current && typeof current === 'object' && key in current) {
          current = current[key]
        } else {
          found = false
          break
        }
      }

      if (!found || current === null || current === undefined) {
        continue
      }

      if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
        return String(current)
      }

      if (Array.isArray(current)) {
        return String(current.length)
      }
    }

    return undefined
  }

  const refreshKernelStatus = useCallback(async () => {
    try {
      const raw = await GetKernelStatus()
      const data = JSON.parse(raw)

      const processState = readValue(data, [
        ['state', 'process'],
        ['process', 'state'],
        ['process_state'],
        ['state'],
      ]) ?? 'Unknown'

      const coherenceStatus = readValue(data, [
        ['trust', 'coherence'],
        ['coherence', 'status'],
        ['coherence'],
        ['state', 'coherence'],
      ]) ?? 'Unknown'

      const fieldSize = readValue(data, [
        ['state', 'field_size'],
        ['field', 'size'],
        ['attentional_field', 'size'],
        ['context', 'field_size'],
      ]) ?? 'Unknown'

      setKernelStatus({
        processState,
        coherenceStatus,
        fieldSize,
        offline: false,
      })
    } catch {
      setKernelStatus({
        processState: 'Offline',
        coherenceStatus: 'Offline',
        fieldSize: 'Offline',
        offline: true,
      })
    }
  }, [])

  useEffect(() => {
    GetWorkspaceRoot().then(setWorkspaceRoot)
    refreshServices()
    refreshKernelStatus()

    // Refresh every 10 seconds
    const interval = setInterval(() => {
      refreshServices()
      refreshKernelStatus()
    }, 10000)
    return () => clearInterval(interval)
  }, [refreshServices, refreshKernelStatus])

  // Initialize theme and debug mode
  useEffect(() => {
    const savedTheme = localStorage.getItem('cog-theme')
    if (savedTheme) {
      try {
        const t = JSON.parse(savedTheme)
        setTheme(t)
        document.documentElement.classList.toggle('dark', t === 'dark')
      } catch {
        document.documentElement.classList.add('dark')
      }
    }

    fetch(`${KERNEL_URL}/debug`)
      .then(res => res.json())
      .then(data => {
        setDebugMode(data.debug ?? false)
        setDebugLoading(false)
      })
      .catch(() => setDebugLoading(false))
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    localStorage.setItem('cog-theme', JSON.stringify(newTheme))
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
  }

  const toggleDebugMode = async () => {
    try {
      const res = await fetch(`${KERNEL_URL}/debug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ debug: !debugMode })
      })
      const data = await res.json()
      setDebugMode(data.debug ?? false)
    } catch (e) {
      console.error('Failed to toggle debug mode:', e)
    }
  }

  const handleServiceAction = async (
    action: 'restart' | 'start' | 'stop' | 'enable',
    name: string
  ) => {
    setActionInProgress(name)
    setMessage(null)

    try {
      let result
      switch (action) {
        case 'restart':
          result = await RestartService(name)
          break
        case 'start':
          result = await StartService(name)
          break
        case 'stop':
          result = await StopService(name)
          break
        case 'enable':
          result = await EnableService(name)
          break
      }
      const msg = Array.isArray(result) ? result[1] : String(result)
      setMessage(msg)
    } catch (err) {
      setMessage(String(err))
    }

    setTimeout(() => {
      refreshServices()
      setActionInProgress(null)
    }, 2000)
  }

  const getStatusColor = (svc: ServiceStatus) => {
    if (svc.healthy) return 'text-green-500'
    if (svc.running) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getStatusIcon = (svc: ServiceStatus) => {
    if (svc.healthy) return <Check className="w-4 h-4 text-green-500" />
    if (svc.running) return <AlertCircle className="w-4 h-4 text-yellow-500" />
    return <X className="w-4 h-4 text-red-500" />
  }

  const getStatusText = (svc: ServiceStatus) => {
    if (svc.healthy) return 'Healthy'
    if (svc.running) return 'Running (unhealthy)'
    if (svc.launchd) return 'Stopped'
    return 'Not configured'
  }

  return (
    <div className="h-full overflow-auto bg-gray-900 text-gray-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Settings className="w-8 h-8 text-purple-400" />
          <h1 className="text-2xl font-bold">Desktop Settings</h1>
        </div>

        {/* Workspace Info */}
        {workspaceRoot && (
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-sm text-gray-400">Workspace</div>
            <div className="font-mono text-sm text-gray-200">{workspaceRoot}</div>
          </div>
        )}

        {/* Message */}
        {message && (
          <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-3 text-purple-200">
            {message}
          </div>
        )}

        {/* Appearance */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Appearance</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Theme</div>
              <div className="text-sm text-gray-400">Switch between dark and light mode</div>
            </div>
            <button
              onClick={toggleTheme}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
            </button>
          </div>
        </div>

        {/* Developer */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Developer</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Debug Mode</div>
              <div className="text-sm text-gray-400">Log kernel inference events</div>
            </div>
            <button
              onClick={toggleDebugMode}
              disabled={debugLoading}
              className={`px-4 py-2 rounded-lg transition-colors ${
                debugMode
                  ? 'bg-purple-600 hover:bg-purple-500'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {debugLoading ? '...' : debugMode ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        {/* Services */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Kernel Status</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Process State</span>
              <span className={kernelStatus.offline ? 'text-red-400' : 'text-gray-200'}>{kernelStatus.processState}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Coherence</span>
              <span className={kernelStatus.offline ? 'text-red-400' : 'text-gray-200'}>{kernelStatus.coherenceStatus}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Field Size</span>
              <span className={kernelStatus.offline ? 'text-red-400' : 'text-gray-200'}>{kernelStatus.fieldSize}</span>
            </div>
          </div>
        </div>

        {/* Services */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Services</h2>
            <button
              onClick={refreshServices}
              disabled={loading}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading services...</div>
          ) : (
            <div className="space-y-3">
              {services.map((svc) => (
                <div
                  key={svc.name}
                  className="bg-gray-900 rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(svc)}
                    <div>
                      <div className="font-medium">{svc.name}</div>
                      <div className="text-sm text-gray-400">
                        Port {svc.port} · {getStatusText(svc)}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!svc.launchd ? (
                      <button
                        onClick={() => handleServiceAction('enable', svc.name)}
                        disabled={actionInProgress === svc.name}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Enable
                      </button>
                    ) : !svc.running ? (
                      <button
                        onClick={() => handleServiceAction('start', svc.name)}
                        disabled={actionInProgress === svc.name}
                        className="p-1.5 bg-green-600 hover:bg-green-500 rounded transition-colors disabled:opacity-50"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleServiceAction('restart', svc.name)}
                          disabled={actionInProgress === svc.name}
                          className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded transition-colors disabled:opacity-50"
                          title="Restart"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleServiceAction('stop', svc.name)}
                          disabled={actionInProgress === svc.name}
                          className="p-1.5 bg-red-600 hover:bg-red-500 rounded transition-colors disabled:opacity-50"
                          title="Stop"
                        >
                          <Square className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Desktop Settings plugin definition
 */
export const desktopSettingsPlugin: Plugin = {
  id: 'desktop-settings',
  name: 'Settings',
  icon: Settings,
  component: DesktopSettingsView,
  position: 'secondary',
  order: 99, // Last in the list
}
