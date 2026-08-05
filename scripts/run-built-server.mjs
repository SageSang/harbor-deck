const profile = process.argv[2] === 'start' ? 'start' : 'preview'

process.env.NODE_ENV ||= 'production'
process.env.PORT ||= profile === 'start' ? '80' : '3001'
process.env.CONFIG_DIR ||= profile === 'start' ? '/app/config' : './config'

await import('../dist-server/server/index.js')
