const fs = require('fs')
const path = require('path')

class ConfigCenter {
  constructor({ pluginId }) {
    this.pluginId = pluginId
  }

  config() {
    const configPath = path.join(__dirname, this.pluginId, 'config.json')
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8')
      return JSON.parse(content)
    }
    return {}
  }

  hasFile(fileName) {
    const filePath = path.join(__dirname, this.pluginId, fileName)
    return fs.existsSync(filePath)
  }

  requireFile(fileName) {
    const filePath = path.join(__dirname, this.pluginId, fileName)
    if (fs.existsSync(filePath)) {
      return require(filePath)
    }
    return null
  }
}

module.exports = function createConfig(options) {
  return new ConfigCenter(options)
}
