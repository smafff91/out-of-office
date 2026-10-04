# platform

Adapters for device features: geolocation, camera/photo upload, sharing, opening external apps.

Today they wrap browser APIs; after launch they will wrap Capacitor plugins with the same interface.
Components never call these APIs directly: they import from here.
