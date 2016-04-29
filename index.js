// Generated by CoffeeScript 1.10.0
(function() {
  var async, changeHtml2Php, changePhp2Html, config, fileExists, formatUrl, fs, getPage, getPages, getPathname, getResource, isHtmlPage, main, mkdirp, path, request, url, urlRelative, writeStream, wrongPagePaths;

  request = require("request");

  url = require("url");

  path = require("flavored-path");

  async = require("async");

  mkdirp = require("mkdirp");

  fs = require("fs");


  /*
   * 请修改下面的参数，然后执行该脚本下载对应的网页
   * 这个脚本仅在Linux 和 OSX 下面测试通过，如有问题请联系 mike.cyc@gmail.com
   */

  config = {
    outpath: "~/download/path",
    rooturl: "http://xxx.com/path/index.html",
    cachePath: ".cache",
    ajaxroot: "",
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.109 Safari/537.36'
    },
    addPages: []
  };

  fileExists = fs.exists || path.exists;

  formatUrl = function(u) {
    var filename;
    u = changePhp2Html(u);
    u = url.parse(u);
    filename = (u.pathname || '').replace(/&$/, '');
    if (u.query && /^route=/.test(u.query)) {
      filename = path.join(filename.replace(/\/[^\/]+$/, "/"), u.query.replace(/^route=/, "").replace(/&/g, '{').replace(/\=/g, "}").replace(/\//g, "-").replace(/[^a-zA-Z0-9_\-,=&\{\}\+]+/g, ",") + ".html");
    }
    if (!filename || /\/$/.test(filename)) {
      filename += "index.html";
    }
    return filename;
  };

  getPathname = function(u) {
    var cachePath, filename, relativePath, rooturl, toPath;
    filename = formatUrl(u);
    rooturl = url.parse(config.rooturl);
    relativePath = path.relative(rooturl.pathname.replace(/\/[^\/]+$/, "/"), filename);
    toPath = path.get(path.join(config.outpath, relativePath));
    cachePath = path.get(path.join(config.outpath, config.cachePath, relativePath));
    return [toPath, cachePath];
  };

  urlRelative = function(from, to) {
    var ctime, t, u1, u2, ups;
    ctime = (new Date()).getTime().toString();
    u1 = url.parse(from).pathname.replace(/\/[^\/]+$/, "/");
    ups = url.parse(to);
    u2 = formatUrl(to).replace(/\/$/, "/" + ctime);
    t = path.relative(u1, u2);
    t = t.replace(new RegExp("" + ctime), "");
    return "" + t + (ups.search || '') + (ups.hash || '');
  };

  wrongPagePaths = {};

  getPage = function(u, callback) {
    var doit, tryCount;
    if (wrongPagePaths[u] > 2) {
      return callback(0, "", 404);
    }
    console.log("Get page " + u);
    tryCount = 0;
    doit = function() {
      var buf, isErr;
      buf = [];
      isErr = 0;
      return request.get(u, {
        timeout: 15000,
        headers: config.headers
      }).on("error", function(err) {
        isErr = 1;
        tryCount++;
        if (tryCount < 3) {
          console.log("Connect wrong, try again.");
          doit();
          return;
        }
        return callback(err);
      }).on('response', function(response) {
        response.on('data', function(data) {
          return buf.push(data);
        });
        response.on('end', function() {
          if (response.statusCode !== 200) {
            console.log("Warning: page status " + response.statusCode);
            wrongPagePaths[u] = (wrongPagePaths[u] || 0) + 1;
          }
          if (!isErr) {
            return callback(0, (response.statusCode === 200 || /404/.test(u) ? Buffer.concat(buf) : ""), response.statusCode);
          }
        });
      });
    };
    return doit();
  };

  isHtmlPage = function(pathname) {
    return /\.(html|php|css|js)$/.test(pathname);
  };

  changePhp2Html = function(t) {
    var http, up;
    if (/\.php/i.test(t)) {
      if (/css/i.test(t)) {
        t = t.replace(/\.php/i, ".css") + "#php";
      } else {
        t = t.replace(/\.php/i, ".html") + "#php";
      }
    } else {
      if (t) {
        up = url.parse(t);
        if (up.pathname && !/\/$/.test(up.pathname) && !/[^\s\/\.\?#]+\.[a-zA-Z0-9]+$/.test(up.pathname)) {
          http = up.protocol ? up.protocol + "//" : "";
          t = "" + http + up.pathname + ".html" + (up.search || '') + (up.hash || '') + "#-html";
        }
      }
    }
    return t;
  };

  changeHtml2Php = function(t) {
    t = t.replace(/\.html#\-html$/, "");
    if (/#php$/.test(t)) {
      if (/css/i.test(t)) {
        t = t.replace(/\.css([^\.a-zA-Z]|$)/, ".php$1").replace(/#php$/, "");
      } else {
        t = t.replace(/\.html([^\.a-zA-Z]|$)/, ".php$1").replace(/#php$/, "");
      }
    } else if (/#\-html$/.test(t)) {
      t = t.replace(/([^\.\/\s\?#]+)\.html/, "$1").replace(/#\-html$/, '');
    }
    return t;
  };

  getResource = function(stream, curl, pathname, callback) {
    var dostring, moreurls;
    moreurls = {};
    if (isHtmlPage(pathname)) {
      stream = stream.toString().replace(/\r\n/g, "\n").replace(/\r/g, "").replace(/\s+$/mg, '');
      if (config.ajaxroot && !/\.css$/i.test(pathname)) {
        curl = config.ajaxroot;
      }
      dostring = function(pstring, left, urlpath, right) {
        var rooturl;
        if (/^data:image/i.test(urlpath)) {
          return pstring;
        }
        if (/^(#|\?)$/.test(urlpath) || /^(javascript:|mailto:)/i.test(urlpath)) {
          return pstring;
        }
        if (/^\/\//i.test(urlpath)) {
          urlpath = url.parse(curl).protocol + urlpath;
        }
        if (/^https?:/i.test(urlpath) && url.parse(urlpath).host !== url.parse(curl).host) {
          return pstring;
        }
        urlpath = url.resolve(curl, urlpath);
        rooturl = url.parse(config.rooturl);
        if (urlpath.indexOf((rooturl.protocol + "//" + rooturl.hostname + rooturl.pathname).replace(/\/[^\/]+$/, "/")) !== 0) {
          return pstring;
        }
        urlpath = urlpath.replace(/&amp;/g, "&");
        moreurls[urlpath] = 1;
        if (/\s+src=\S+\.(png|jpg|jpeg)["'\s]/i.test(pstring) && !/@2x\./.test(pstring)) {
          moreurls[urlpath.replace(/\.(png|jpg|jpeg)([#\?]|$)/i, "@2x.$1$2")] = 1;
        }
        urlpath = urlRelative(curl, urlpath);
        return "" + left + urlpath + right;
      };
      stream = stream.replace(/(url\(['"]?)([^\s"'\(\)]+?)(['"]?\))/ig, dostring);
      stream = stream.replace(/((?:loadURL|loadScript)\s*\(\s*['"])([^\s"']+?)(['"])/g, dostring);
      if (/\.js$/i.test(pathname)) {
        stream = stream.replace(/(["'])([^\s\\"'>]+?\.(?:js|css|png|jpg|jpeg|html|svg|json))(\1)/ig, dostring);
      } else {
        stream = stream.replace(/(\s+(?:href|src|data-lazyload|data-thumb|url|data-image|data-val|data-iview-thumbnail|data-iview-image|data-iview-transition|data-at2x)\s*=\s*["']?)([^\s"'>]+?)(["'\s>])/ig, dostring);
      }
    }
    return callback(0, stream, Object.keys(moreurls));
  };

  writeStream = function(stream, pathname, callback) {
    var ws;
    console.log("Writing file " + pathname);
    mkdirp.sync(path.dirname(pathname));
    ws = fs.createWriteStream(pathname);
    return ws.end(stream, callback);
  };

  getPages = function(urls, callback) {
    return async.eachSeries(urls, function(u, callback) {
      if (!/^https?:\/\//.test(u)) {
        u = url.resolve(config.rooturl.replace(/\/[^\/]+$/, "/"), u);
      }
      return async.waterfall([
        function(callback) {
          var cachepath, pathname, ref;
          ref = getPathname(u), pathname = ref[0], cachepath = ref[1];
          return callback(0, pathname, cachepath);
        }, function(pathname, cachepath, callback) {
          return fileExists((isHtmlPage(pathname) ? cachepath : pathname), function(exists) {
            return callback(0, exists, pathname, cachepath);
          });
        }, function(isExists, pathname, cachepath, callback) {
          if (!isExists) {
            return async.waterfall([
              function(callback) {
                return getPage(u, callback);
              }, function(stream, statusCode, callback) {
                if (isHtmlPage(pathname) && stream.length > 0) {
                  return writeStream(stream, cachepath, function(err) {
                    if (err) {
                      return callback(err);
                    }
                    return getResource(stream, u, pathname, function(err, stream, moreurls) {
                      if (err) {
                        return callback(err);
                      }
                      return writeStream(stream, pathname, function(err) {
                        callback(err, moreurls);
                      });
                    });
                  });
                } else if (stream.length > 0 || statusCode === 200) {
                  return writeStream(stream, pathname, function(err) {
                    return callback(err, []);
                  });
                } else {
                  return callback(0, []);
                }
              }, getPages
            ], callback);
          } else {
            if (isHtmlPage(pathname)) {
              return async.waterfall([
                function(callback) {
                  return fs.readFile(cachepath, function(err, data) {
                    return callback(err, data, u, pathname);
                  });
                }, getResource, function(stream, moreurls, callback) {
                  return fileExists(pathname, function(exists) {
                    if (exists) {
                      callback(0, stream, moreurls);
                    } else {
                      writeStream(stream, pathname, function(err) {
                        return callback(err, stream, moreurls);
                      });
                    }
                  });
                }, function(stream, moreurls, callback) {
                  var murls;
                  murls = [];
                  return async.each(moreurls, function(u, callback) {
                    var ref;
                    ref = getPathname(u), pathname = ref[0], cachepath = ref[1];
                    return fileExists(pathname, function(exists) {
                      if (!exists) {
                        murls.push(u);
                      }
                      return callback(0);
                    });
                  }, function(err) {
                    return callback(err, murls);
                  });
                }, getPages
              ], callback);
            } else {
              return callback(0);
            }
          }
        }
      ], callback);
    }, callback);
  };

  main = function() {
    return getPages([config.rooturl], function(err) {
      if (err) {
        console.log(err);
      }
      return getPages(config.addPages, function(err) {
        if (err) {
          return console.log(err);
        }
        return fs.writeFile(path.resolve(config.outpath, "website.url"), config.rooturl, function(err) {
          if (err) {
            return console.log(err);
          }
          return console.log("ALL DONE!");
        });
      });
    });
  };

  main();

}).call(this);