function f() {
  const appEntities = getAppEntities(loadObject).filter(
    entity => entity && entity.isInstallAvailable() && !entity.isQueue() && entity.isDisabled()
  )
}

function f() {
  const appEntities = getAppEntities(loadObject).map(
    entity => entity && entity.isInstallAvailable() && !entity.isQueue() && entity.isDisabled() && {
      id: entity.id
    }
  )
}
