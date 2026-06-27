// Learn more: https://docs.expo.dev/guides/monorepo/
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
// The workspace root is two levels up: apps/mobile -> apps -> <root>.
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// 1. Watch all files within the monorepo so changes in workspace packages
//    (e.g. @workout/core, @workout/supabase) trigger fast refresh.
config.watchFolders = [workspaceRoot]

// 2. Let Metro resolve modules from both the project and the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

module.exports = config
