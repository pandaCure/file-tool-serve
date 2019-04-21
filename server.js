const http = require('http')
const fs = require('fs')
const path = require('path')
const OpenCC = require('opencc')
const Koa = require('koa')
const bodyparser = require('koa-bodyparser')
const cors = require('koa2-cors')
const router = require('koa-router')()
const multer = require('koa-multer')
const util = require('util')
const exec = require('child_process').exec
const archiver = require('archiver')
const opencc = new OpenCC('s2t.json')
const send = require('koa-send')
const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)
const convert = async (data) => {
  return new Promise((resolve, reject) => {
    opencc.convert(data, (err, convert) => {
      if (err) reject(err)
      resolve(convert)
    })
  })
}
const srtToConvert = async () => {
  const writePath = path.resolve(__dirname, `${uploadPath}/${file.originalname}`)
  const data = await readFile(file.path, 'utf8')
  const changeData = await convert(data)
  await writeFile(writePath, changeData, 'utf8')
}
const zipPath = './zip'
const zipToConvert = async (file) => {
  // TODO zip嵌套zip的情况 先忽略
  await exec(`unzip -o ${file.path} -d ${path.resolve(__dirname, `unzipFile`)}`)
  await fs.readdir(path.resolve(__dirname, 'unzipFile'), async (err, data) => {
    if (err) console.log('失败')
    data.forEach(async file => {
      console.log(typeof file)
      if (file.indexOf('.srt') > -1) {
        const data = await readFile(file.path, 'utf8')
        const changeData = await convert(data)
        await writeFile(writePath, changeData, 'utf8')
      } else {
        console.log('不存在')
      }
    })
  })
  await exec('rm -rf zip/*')
  await exec('rm -rf unzipFile/*')
}
const app = new Koa()
app.use(cors({
  origin: () => '*',
  maxAge: 5,
  allowHeaders: ['Content-Type', 'Authorization', 'Accept']
}))
app.use(bodyparser())
const upload = multer({ dest: 'uploads/' })
const uploadPath = './handleFile'
router.post('/file', upload.array('files'), async (ctx, next) => {
  console.log(ctx.req.files)
  const flag = fs.existsSync(uploadPath)
  if (!flag) fs.mkdirSync(path.resolve(__dirname, uploadPath))
  try {
    for await (file of ctx.req.files) {
      if (file.originalname.indexOf('.srt') > -1) {
        await srtToConvert(file)
      } else if (file.originalname.indexOf('.zip') > -1) {
        // TODO 解压zip包
        await zipToConvert(file)
      }
    }
  } catch (e) {
    ctx.body = {
      status: 'fail'
    }
    return false
  }
  exec('rm -rf ./uploads/*')
  ctx.body = {
    status: 'ok'
  }
})
router.get('/download', async ctx => {
  const archive = archiver('zip', {
    zlib: {
      level: 9
    }
  })
  const output = fs.createWriteStream(__dirname + `/zipFile/title.zip`)
  archive.directory('./handleFile/', false)
  archive.pipe(output)
  await archive.finalize()
  ctx.attachment('zipFile/title.zip')
  // ctx.set('Content-Type', 'application/force-download')

  await send(ctx, 'zipFile/title.zip')
  // ctx.body = fs.createReadStream('zipFile/title.zip')
  await exec('rm -rf ./zipFile/*')
  await exec('rm -rf ./handleFile/*')
})
app.use(router.routes()).use(router.allowedMethods())
const server = http.createServer(app.callback())
const onListening = () => {
  console.log(`server is starting at port 5000`)
}
server.on('listening', onListening)
server.listen(5000)