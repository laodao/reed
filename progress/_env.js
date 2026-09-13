const path = require('path')
try { console.log('ws:', require.resolve('ws')) } catch (e) { console.log('no ws') }
try { console.log('playwright-core:', require.resolve('playwright-core')) } catch (e) { console.log('no playwright-core') }
console.log('node:', process.version)
console.log('cwd:', process.cwd())
