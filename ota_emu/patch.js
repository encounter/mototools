var parser = require('./parser');
var cp = require('child_process');
var fs = require('fs-extra');
var q = require('q');
var paths = require('path');
var argv = require('minimist')(process.argv.slice(2), {boolean: ['force', 'debug']});
var crypto = require('crypto');
var deasync = require('deasync');
var Zip = require('adm-zip');
var util = require('util');
var colors = require('colors');

function log(str) {
  process.stdout.write(str);
}

function loginfo(str) {
  log(str.blue);
}

function logerr(err) {
  if (err.stack) {
    err = err.stack;
  }
  log('Error: '.red + err + '\n');
}

function logwarn(str) {
  log('Warning: '.yellow + str + '\n');
}

function logdebug(str) {
  if (argv.debug)
    log('Debug: '.grey + str + '\n');
}

if (argv._.length !== 3) {
  console.log('Usage: sudo node patch.js [--debug] [--force] <image folder> <output folder> <OTA zip>');
  process.exit(-1);
}

if (!process.getuid) {
  logerr('Linux only.');
  process.exit(-1);
}

if (process.getuid() !== 0) {
  logerr('Run as root.');
  process.exit(-1);
}

function exec(cmd, args, opts) {
  if (args && args.length) {
    cmd += ' ' + args.join(' ');
  }
  return cp.execSync(cmd, opts).toString();
}

function spawn(cmd, args, opts) {
  return cp.spawnSync(cmd, args, opts);
}

function exists(path) {
  try {
    fs.accessSync(path);
    return true;
  } catch (e) {
    return false;
  }
}

function getSeContext(file) {
  return exec('getfattr', ['--only-values', '--absolute-names', '-h', '-n', 'security.selinux', file]);
}

function setSeContext(file, context) {
  return exec('setfattr', ['-h', '-n', 'security.selinux', '-v', context, file]);
}

var resetSelinux = false;
function checkSelinux() {
  var status = exec('getenforce').trim();
  if (status === 'Enforcing') {
    loginfo('Setting SELinux to permissive mode... ');
    resetSelinux = true;
    exec('setenforce 0');
    log('Done!\n'.green);
  }
}

var walkSync = function(dir, recurse, includeDirs, filelist) {
  var files = fs.readdirSync(dir);

  filelist = filelist || [];
  recurse = recurse || false;
  includeDirs = includeDirs || false;

  files.forEach(function (file) {
    var path = paths.join(dir, file);
    var stats = fs.lstatSync(path);
    if (!stats.isDirectory() || includeDirs) {
      filelist.push(path);
    }
    if (stats.isDirectory() && recurse) {
      filelist = walkSync(path, includeDirs, recurse, filelist);
    }
  });
  return filelist;
};

function setMetadata(path, data, recursive) {
  var stats = fs.lstatSync(path);
  var realpath = path, followSymlink = false;
  if (stats.isSymbolicLink()) {
    // We need to operate on its target, so resolve the symlink
    var target = fs.readlinkSync(path);
    if (target.indexOf('/') === 0) {
      realpath = paths.join(mountDir, target);
    } else {
      realpath = paths.join(paths.dirname(path), target);
    }
    if (exists(realpath)) {
      followSymlink = true;
    } else {
      logwarn('Symlink target doesn\'t exist: ' + realpath);
    }
  }
  if (data.hasOwnProperty('uid') && data.hasOwnProperty('gid')) {
    logdebug('Setting UID ' + data.uid + ', GID ' + data.gid + ' for ' + path);
    fs.lchownSync(path, data.uid, data.gid);
    if (followSymlink) {
      fs.chownSync(realpath, data.uid, data.gid);
    }
  }
  // Linux does not have lchmod, so we have to make sure the target exists
  if (!stats.isSymbolicLink() || followSymlink) {
    if (stats.isDirectory()) {
        if (data.hasOwnProperty('dmode')) {
          logdebug('Setting dmode ' + data.dmode.oct + ' for ' + realpath);
          fs.chmodSync(realpath, data.dmode.oct);
        } else if (data.hasOwnProperty('mode')) {
          logdebug('Setting mode ' + data.mode.oct + ' for ' + realpath);
          fs.chmodSync(realpath, data.mode.oct);
        }
        if (recursive) {
          walkSync(path, false, true).forEach(function (file) {
            setMetadata(file, data, recursive);
          });
        }
    } else {
      if (data.hasOwnProperty('fmode')) {
        logdebug('Setting fmode ' + data.dmode.oct + ' for ' + realpath);
        fs.chmodSync(realpath, data.fmode.oct);
      } else if (data.hasOwnProperty('mode')) {
        logdebug('Setting mode ' + data.mode.oct + ' for ' + realpath);
        fs.chmodSync(realpath, data.mode.oct);
      }
    }
  }
  if (data.hasOwnProperty('selabel')) {
    logdebug('Setting selabel ' + data.selabel + ' for ' + path);
    setSeContext(path, data.selabel);
    if (followSymlink) {
      setSeContext(realpath, data.selabel);
    }
    var newLabel = getSeContext(path);
    if (data.selabel !== newLabel) {
      throw 'Failed to set SELinux context for ' + path + '. Expected: ' + data.label + ', got: ' + newLabel;
    }
    if (followSymlink) {
      newlabel = getSeContext(realpath);
      if (data.selabel !== newLabel) {
        throw 'Failed to set SELinux context for ' + realpath + '. Expected: ' + data.label + ', got: ' + newLabel;
      }
    }
  }
}

function parseMetadata(args, recursive) {
  var path = paths.join(mountDir, args[0]);
  var data = {};
  for (var i = 1; i < args.length; i += 2) {
    data[args[i]] = args[i + 1];
  }
  setMetadata(path, data, recursive);
}

var mountDir = '/mnt/patch-img';
var tmpDir = '/tmp/patch-img';
var imageDir = argv._[0];
var newImageDir = argv._[1];
var otaZipPath = argv._[2];
fs.accessSync(imageDir);
fs.accessSync(otaZipPath);
fs.ensureDirSync(tmpDir);
fs.ensureDirSync(newImageDir);
var otaZip = new Zip(otaZipPath);
var fastbootCmds = '';

var folderCreated = false;
var imageMounted = false;

var tmpMountDir = paths.join(mountDir, 'tmp');
fs.ensureDirSync(tmpMountDir);
spawn('mount', ['--bind', tmpDir, tmpMountDir]);

function getImagePath(dir, mountPath) {
  var imageName = paths.basename(mountPath);
  return paths.join(dir, imageName) + '.img';
}

function mountImage(path, fsType) {
  fs.ensureDirSync(mountDir);
  folderCreated = true;
  var imagePath = getImagePath(imageDir, path);
  if (!exists(imagePath)) {
    throw 'Image file ' + imagePath + ' not found.';
  }

  var newImagePath = getImagePath(newImageDir, path);
  copyFile(imagePath, newImagePath);

  var mountPath = paths.join(mountDir, path);
  // TODO check already mounted?
  fs.ensureDirSync(mountPath);

  loginfo('Mounting image ' + newImagePath + '... ');
  exec('mount', ['-o', 'loop', '-t', fsType || 'ext4', newImagePath, mountPath]);
  imageMounted = true;
  log('Done!\n'.green);

  fastbootCmds += 'fastboot flash ' + path.substring(1) + ' ' + paths.basename(newImagePath) + '\n';
}

function cleanup() {
  loginfo('\nCleaning up... ');
  exec('sync');
  if (imageMounted) {
    exec('umount', [mountDir + '/*']);
  }
  if (folderCreated) {
    try {
      exec('rmdir', [mountDir + '/*']);
    } catch (e) {} // TODO
    fs.rmdir(mountDir);
  }
  fs.removeSync(tmpDir);
  if (resetSelinux) {
    exec('setenforce 1');
  }
  log('Done!\n'.green);
}

function copyFile(fromFile, toFile) {
  loginfo('Copying image... ');
  fs.copySync(fromFile, toFile);
  log('Done!\n'.green);
}

function parseScript() {
  var deferred = q.defer();
  loginfo('Parsing script... ');
  otaZip.readAsTextAsync('META-INF/com/google/android/updater-script', function (str) {
    if (!str) {
      deferred.reject('Failed to read updater-script.');
    }
    try {
      var ret = parser.parse(str);
    } catch (e) {
      logerr('Parsing error at ' + JSON.stringify(e.location));
      deferred.reject(e);
      return;
    }
    log('Done!\n'.green);
    deferred.resolve(ret);
  });
  return deferred.promise;
}

function execScript(parsed) {
  checkSelinux();
  loginfo('Executing script...\n\n');
  parsed.forEach(parseExpr);
  log('\nDone! '.green + 'Run the following commands to flash:\n\n' + fastbootCmds + '\n');
}

function parseExpr(expr) {
  if (expr.expr === 'concat') {
    return expr.args.map(parseExpr).join('');
  } else if (expr.expr === 'method') {
    return runMethod(expr);
  } else if (expr.expr === 'or') {
    var ret;
    for (var i = 0; i < expr.args.length; ++i) {
      ret = parseExpr(expr.args[i]);
      if (ret) break;
    }
    return ret;
  } else if (expr.oper === '==') {
    return parseExpr(expr.left) == parseExpr(expr.right);
  }
  return expr;
}

function hashFile(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

function getProp(prop) {
  var str = fs.readFileSync(paths.join(mountDir, 'system/build.prop')).toString();
  var split = str.split('\n');
  for (var i = 0; i < split.length; ++i) {
    var line = split[i];
    if (line.startsWith(prop + '=')) {
      return line.substring(prop.length + 1);
    }
  }
  return null;
}

function extractFile(file, toPath, keepPath) {
  var path = paths.dirname(toPath);
  var filename = paths.basename(toPath);
  // TODO extract to specific path/file
  otaZip.extractEntryTo(file, toPath, keepPath, true);
}

function mountJoin(file) {
  return paths.join(mountDir, file);
}

function runMethod(method) {
  var parseArgs = function () {
    return method.args.map(parseExpr);
  };
  switch (method.name) {
    case 'ui_print':
      console.log(parseArgs().join(' '));
      return;
    case 'getprop':
      var args = parseArgs();
      return getProp(args[0]);
    case 'mount':
      var args = parseArgs();
      var fsType = args[0];
      var mountPath = args[3];
      mountImage(mountPath, fsType);
      return true;
    case 'abort':
      var msg = parseArgs().join('');
      if (argv.force) {
        logwarn(msg);
        return;
      } else {
        throw msg;
      }
    case 'assert':
      return method.args.every(function (assertion) {
        try {
          var ret = parseExpr(assertion);
          if (typeof ret !== 'undefined' && ret) {
            return true;
          }
        } catch (e) {
          logerr(e);
        }
        var msg = 'Assertion failed: ' + assertion.raw;
        if (argv.force) {
          logwarn(msg);
          return true;
        } else {
          throw msg;
        }
      });
    case 'apply_patch_check':
      var args = parseArgs();
      var path = args[0];
      var expectedHashes;
      if (method.args.length > 1) {
        path = paths.join(mountDir, path);
        expectedHashes = args.slice(1, method.args.length);
      } else if (method.args.length === 1 && path.startsWith('EMMC:')) {
        var split = path.split(':');
        path = getImagePath(imageDir, split[1]);
        expectedHashes = [split[3], split[5]];
      } else {
        throw 'Don\'t know how to parse apply_patch_check arguments: ' + args.join(', ');
      }
      return expectedHashes.indexOf(hashFile(path)) !== -1;
    case 'show_progress':
      // TODO
      return;
    case 'set_progress':
      // TODO
      return;
    case 'apply_patch_space':
      var args = parseArgs();
      var avail = parseInt(exec('df -B1 /tmp --output=avail | tail -1'));
      var required = args[0];
      if (typeof required.dec !== 'undefined') {
        required = required.dec;
      }
      return avail >= required;
    case 'package_extract_file':
      var args = parseArgs();
      var path = args[0];
      //var toPath = args[1]; TODO
      logdebug('Extracting ' + path + '...');
      otaZip.extractEntryTo(path, tmpDir, true, true);
      var extracted = paths.join(tmpDir, path);
      return exists(extracted) && extracted;
    case 'package_extract_dir':
      var args = parseArgs();
      var dir = args[0];
      var toDir = paths.join(mountDir, args[1]);
      otaZip.getEntries().forEach(function (entry) {
        if (!entry.isDirectory && entry.entryName.startsWith(dir + '/')) {
          var extractPath = paths.join(toDir, entry.entryName.substring(dir.length));
          logdebug('Extracting to ' + extractPath + '...');
          otaZip.extractEntryTo(entry, paths.dirname(extractPath), false, true);
        }
      });
      return true;
    case 'apply_patch':
      var args = parseArgs();
      var path = args[0];
      var targetPath = args[1];
      if (path.startsWith('EMMC:')) {
        var split = path.split(':');
        path = getImagePath(imageDir, split[1]);
        targetPath = getImagePath(newImageDir, split[1]);
      } else {
        path = paths.join(mountDir, path);
      }
      var spawnArgs = [
        path,
        targetPath,
        args[2].hex,
        args[3],
        args[4].hex + ':' + args[5]
      ];
      logdebug('Patching ' + path);
      var ret = spawn('applypatch', spawnArgs);
      if (ret.status !== 0) {
        logwarn(ret.stdout.toString());
        logwarn(ret.stderr.toString());
      }
      return ret.status === 0;
    case 'delete':
    case 'delete_recursive':
      parseArgs()
          .map(mountJoin)
          .forEach(fs.removeSync);
      return true;
    case 'set_metadata':
      parseMetadata(parseArgs(), false);
      return true;
    case 'set_metadata_recursive':
      parseMetadata(parseArgs(), true);
      return true;
    case 'format':
      var args = parseArgs();
      // TODO support format FS?
      fastbootCmds += 'fastboot erase ' + paths.basename(args[2]) + '\n';
      return true;
    case 'unmount':
      var partition = parseArgs()[0];
      logdebug('Unmounting ' + partition)
      exec('sync');
      return spawn('umount', [paths.join(mountDir, partition)]).status === 0;
    case 'sha1_check':
      var args = parseArgs();
      return exists(args[0]) && hashFile(args[0]) === args[1];
    case 'read_file':
      return paths.join(mountDir, parseArgs()[0]);
    case 'rename':
      var args = parseArgs();
      var from = paths.join(mountDir, args[0]);
      var to = paths.join(mountDir, args[1]);
      logdebug('Renaming from ' + from + ' to ' + to);
      fs.ensureDirSync(paths.dirname(to));
      fs.renameSync(from, to);
      return true;
    case 'symlink':
      var args = parseArgs();
      var target = args[0];
      args.slice(1, args.length)
          .map(mountJoin)
          .forEach(function (path) {
            logdebug('Symlinking from ' + path + ' to ' + target);
            fs.symlinkSync(target, path);
          });
      return true;
    case 'set_backup_flag':
      // no-op
      return true;
    case 'apply_raw_image':
      var args = parseArgs();
      var filename = paths.basename(args[0]);
      copyFile(paths.join(mountDir, args[0]), paths.join(newImageDir, filename));
      fastbootCmds += 'fastboot flash ' + args[1] + ' ' + filename + '\n';
      return true;
    case 'motorola.update_gpt':
      var args = parseArgs();
      var filename = paths.basename(args[0]);
      copyFile(paths.join(mountDir, args[0]), paths.join(newImageDir, filename));
      fastbootCmds += 'fastboot flash gpt ' + filename + '\n';
      return true;
    default:
      if (argv.force) {
        logwarn('Skipping unknown function ' + method.name);
      } else {
        throw 'Unknown function ' + method.name;
      }
  }
}

parseScript()
  .then(execScript)
  .catch(function (err) {
    logerr(err);
  })
  .finally(cleanup);

