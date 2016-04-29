request = require "request"
url = require "url"
path = require "flavored-path"
async = require "async"
mkdirp = require "mkdirp"
fs = require "fs"

###
# 请修改下面的参数，然后执行该脚本下载对应的网页
# 这个脚本仅在Linux 和 OSX 下面测试通过，如有问题请联系 mike.cyc@gmail.com
###
config =
  # 下载的网页保存的目录
  outpath: "~/download/path"
  # 要下载的网页的根地址
  rooturl: "http://xxx.com/path/index.html"
  cachePath: ".cache"
  # 如果有这个参数说明是动态加载到根目录，适用于ajax请求
  ajaxroot: "" # 例子：http://xxx.com/path
  # http 请求的时候带的参数
  headers:
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.109 Safari/537.36'
  # 附加下载的地址
  addPages:[
  ]

fileExists = fs.exists or path.exists

formatUrl = (u) ->
  u = changePhp2Html u
  u = url.parse u
  filename = (u.pathname or '').replace /&$/, '' # fix some url with & start bug
  #处理index.php的有route的url
  if u.query and /^route=/.test u.query
    filename = path.join filename.replace(/\/[^\/]+$/, "/"), u.query.replace(/^route=/, "").replace(/&/g, '{').replace(/\=/g, "}").replace(/\//g, "-").replace(/[^a-zA-Z0-9_\-,=&\{\}\+]+/g, ",") + ".html"
  if not filename or /\/$/.test filename
    filename += "index.html"
  filename

#得到文件名和目录
getPathname = (u) ->
  filename = formatUrl u
  rooturl = url.parse config.rooturl
  relativePath = path.relative(rooturl.pathname.replace(/\/[^\/]+$/, "/"), filename)
  toPath = path.get path.join config.outpath, relativePath
  cachePath = path.get path.join config.outpath, config.cachePath, relativePath
  [toPath, cachePath]

urlRelative = (from, to) ->
  ctime = (new Date()).getTime().toString()
  u1 = url.parse(from).pathname.replace /\/[^\/]+$/, "/"
  ups = url.parse to
  u2 = formatUrl(to).replace /\/$/, "/#{ctime}"
  t = path.relative(u1, u2)
  t = t.replace (new RegExp("#{ctime}")), ""
  "#{t}#{ups.search or ''}#{ups.hash or ''}"

wrongPagePaths = {}

getPage = (u, callback) ->
  if wrongPagePaths[u] > 2
    return callback 0, "", 404
  console.log "Get page #{u}"
  tryCount = 0 #因为网络的不稳定，这里重试3次
  doit = ->
    buf = []
    isErr = 0
    request.get u,
      timeout: 15000
      headers: config.headers
    .on "error", (err) ->
      isErr = 1
      tryCount++
      if tryCount < 3
        console.log "Connect wrong, try again."
        doit()
        return
      callback err
    .on 'response', (response) ->
      response.on 'data', (data) ->
        buf.push data
      response.on 'end', ->
        if response.statusCode isnt 200
          console.log "Warning: page status #{response.statusCode}"
          wrongPagePaths[u] = (wrongPagePaths[u] or 0) + 1
        if not isErr
          #把404页面也下载下来
          callback(0, (if response.statusCode is 200 or /404/.test(u) then Buffer.concat(buf) else ""), response.statusCode)
      return
  doit()

isHtmlPage = (pathname) ->
  /\.(html|php|css|js)$/.test pathname

changePhp2Html = (t) ->
  #转换php后缀为html
  if /\.php/i.test t
    if /css/i.test t
      t = t.replace(/\.php/i, ".css") + "#php"
    else
      t = t.replace(/\.php/i, ".html") + "#php"
  else
    if t
      up = url.parse t
      if up.pathname and not /\/$/.test(up.pathname) and not /[^\s\/\.\?#]+\.[a-zA-Z0-9]+$/.test(up.pathname)
        http = if up.protocol then "#{up.protocol}//" else ""
        t = "#{http}#{up.pathname}.html#{up.search or ''}#{up.hash or ''}#-html"
  t

changeHtml2Php = (t) ->
  t = t.replace /\.html#\-html$/, ""
  if /#php$/.test t
    if /css/i.test t
      t = t.replace(/\.css([^\.a-zA-Z]|$)/, ".php$1").replace(/#php$/, "")
    else
      t = t.replace(/\.html([^\.a-zA-Z]|$)/, ".php$1").replace(/#php$/, "")
  else if /#\-html$/.test t
    t = t.replace(/([^\.\/\s\?#]+)\.html/, "$1").replace(/#\-html$/, '')
  t

# 得到html的资源文件，并进行正则替换
getResource = (stream, curl, pathname, callback) ->
  moreurls = {}
  if isHtmlPage pathname
    stream = stream.toString().replace(/\r\n/g, "\n").replace(/\r/g, "").replace(/\s+$/mg, '')
    if config.ajaxroot and not /\.css$/i.test pathname
      curl = config.ajaxroot
    # console.info "Get Resource file: #{pathname} =========================="
    dostring = (pstring, left, urlpath, right) ->
      # 过滤data:image
      if /^data:image/i.test urlpath
        return pstring
      if /^(#|\?)$/.test(urlpath) or /^(javascript:|mailto:)/i.test(urlpath)
        return pstring
      # 补齐http前缀
      if /^\/\//i.test urlpath
        urlpath = url.parse(curl).protocol + urlpath
      # 过滤跨域项
      if /^https?:/i.test(urlpath) and url.parse(urlpath).host isnt url.parse(curl).host
        return pstring
      # 转为绝对的url地址
      urlpath = url.resolve curl, urlpath
      # 过滤不在当前子目录的文件
      rooturl = url.parse config.rooturl
      if urlpath.indexOf("#{rooturl.protocol}//#{rooturl.hostname}#{rooturl.pathname}".replace(/\/[^\/]+$/, "/")) != 0
        return pstring
      urlpath = urlpath.replace /&amp;/g, "&"
      moreurls[urlpath] = 1
      # 试图下载@2x的图片文件
      if /\s+src=\S+\.(png|jpg|jpeg)["'\s]/i.test(pstring) and not /@2x\./.test(pstring)
        moreurls[urlpath.replace(/\.(png|jpg|jpeg)([#\?]|$)/i, "@2x.$1$2")] = 1
      # 转为相对地址，回填到html文件中，为了在本机调用
      urlpath = urlRelative curl, urlpath
      return """#{left}#{urlpath}#{right}"""
    stream = stream.replace /(url\(['"]?)([^\s"'\(\)]+?)(['"]?\))/ig, dostring
    stream = stream.replace /((?:loadURL|loadScript)\s*\(\s*['"])([^\s"']+?)(['"])/g, dostring

    if /\.js$/i.test pathname
      # 为了下载angularjs的源代码而设立
      stream = stream.replace /(["'])([^\s\\"'>]+?\.(?:js|css|png|jpg|jpeg|html|svg|json))(\1)/ig, dostring
    else
      stream = stream.replace /(\s+(?:href|src|data-lazyload|data-thumb|url|data-image|data-val|data-iview-thumbnail|data-iview-image|data-iview-transition|data-at2x)\s*=\s*["']?)([^\s"'>]+?)(["'\s>])/ig, dostring
  callback 0, stream, Object.keys(moreurls)


writeStream = (stream, pathname, callback) ->
  console.log "Writing file #{pathname}"
  mkdirp.sync path.dirname pathname
  ws = fs.createWriteStream pathname
  ws.end stream, callback

getPages = (urls, callback) ->
  async.eachSeries urls, (u, callback) ->
    #转为绝对地址，如果不是的话
    if not /^https?:\/\//.test u
      u = url.resolve config.rooturl.replace(/\/[^\/]+$/, "/"), u
    async.waterfall [
      (callback) ->
        [pathname, cachepath] = getPathname u
        callback 0, pathname, cachepath
      (pathname, cachepath, callback) ->
        fileExists (if isHtmlPage pathname then cachepath else pathname), (exists) ->
          callback 0, exists, pathname, cachepath
      (isExists, pathname, cachepath, callback) ->
        if not isExists
          async.waterfall [
            (callback) ->
              getPage u, callback
            (stream, statusCode, callback) ->
              if isHtmlPage(pathname) and stream.length > 0
                writeStream stream, cachepath, (err) ->
                  return callback err if err
                  getResource stream, u, pathname, (err, stream, moreurls) ->
                    return callback err if err
                    writeStream stream, pathname, (err) ->
                      callback err, moreurls
                      return
              else if stream.length > 0  or statusCode is 200
                writeStream stream, pathname, (err) ->
                  callback err, []
              else
                callback 0, []
            getPages
          ], callback
        else
          #console.log "File exists: #{pathname}"
          # 重新读取文件数据
          if isHtmlPage pathname
            async.waterfall [
              (callback) ->
                fs.readFile cachepath, (err, data) ->
                  callback err, data, u, pathname
              getResource
              #重新保存文件
              (stream, moreurls, callback) ->
                fileExists pathname, (exists) ->
                  if exists
                    callback 0, stream, moreurls
                  else
                    writeStream stream, pathname, (err) ->
                      callback err, stream, moreurls
                  return
              (stream, moreurls, callback) ->
                murls = []
                async.each moreurls, (u, callback) ->
                  [pathname, cachepath] = getPathname u
                  fileExists pathname, (exists) ->
                    if not exists
                      murls.push u
                    callback 0
                , (err) ->
                  callback err, murls
              getPages
            ], callback
          else
            callback 0
    ], callback
  , callback

main = ->
  getPages [config.rooturl], (err) ->
    console.log err if err
    getPages config.addPages, (err) ->
      return console.log err if err
      fs.writeFile path.resolve(config.outpath, "website.url"), config.rooturl, (err) ->
        return console.log err if err
        console.log "ALL DONE!"

main()
