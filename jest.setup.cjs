const fs = require('fs')
const os = require('os')
const path = require('path')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zjmTalk-jest-'))
const configPath = path.join(dir, 'zjmTalk.json')
const dataDir = path.join(dir, '.data')
fs.mkdirSync(dataDir, { recursive: true })
fs.writeFileSync(
  configPath,
  JSON.stringify(
    {
      model: {
        model: 'kimi-k2.6',
        apiKey: 'test-api-key',
        baseURL: 'https://api.moonshot.cn/v1',
      },
      env: {
        TAVILY_API_KEY: 'tvly-test-key',
      },
    },
    null,
    2,
  ),
)
process.env.ZJMTALK_CONFIG = configPath
process.env.ZJMTALK_DATA_DIR = dataDir
