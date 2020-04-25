const core = require('@actions/core')
const AdmZip = require('adm-zip')
const targz = require('targz');
const spawn = require('child_process').spawnSync
const fs = require('fs')
const fetch = require('node-fetch')
const path = require('path')
const process = require('process')
const URL = require('url').URL
const http = require('http')

// This could have been a ten-line shell script, but no, we are full-stack async now...
// Though, it does look pretty in the Web console.

// These are platform names as expected by FASM build archive
function selectPlatform(platform) {
    if (platform) { return platform }
    if (process.platform == 'linux')  { return 'linux' }
    if (process.platform == 'win32')  { return 'win64' }
    throw new Error(`unsupported platform: '${process.platform}'`)
}

async function main() {
    // Yeah, these are strings... JavaScript at its finest
    const platform = selectPlatform(core.getInput('platform'))
    const destination = "fasm"

    const homedir = require('os').homedir()
    const absFasmDir = path.resolve(homedir, destination)
    const fasm = (process.platform == 'win32' ? 'fasm.exe' : 'fasm\fasm')
    const absFasmFile = path.join(absFasmDir, fasm)

    if (!fs.existsSync(absFasmDir)) {
        fs.mkdirSync(absFasmDir, {recursive: true})
    }

    async function downloadBinary() {
        var fasm_download_url = '';
        if (process.platform == 'linux')
        {
          fasm_download_url = 'https://flatassembler.net/fasm-1.73.23.tgz';
		//fasm_download_url = 'http://localhost/fasm-1.73.23.tgz';
        }
        else
        {
          fasm_download_url = 'https://flatassembler.net/fasmw17323.zip';
		//fasm_download_url = 'http://localhost/fasmw17323.zip';
        }
        const url = new URL(fasm_download_url)
	const buffer = await fetchBuffer(url)

        // Pull out the one binary we're interested in from the downloaded archive,
        // overwrite anything that's there, and make sure the file is executable.
	if(process.platform == 'linux')
	{
		const file = fs.createWriteStream("fasm.tgz")
		const request = http.get(fasm_download_url, function(response){
			response.pipe(file);
		        targz.decompress({
                            src: `fasm-1.73.23.tgz`,
                            dest: absFasmDir
                        }, function(err){
                            if(err) {
                                console.log(err);
                            } else {
                                console.log("Done!");
                            }
                        });
		});
	}
	else
	{
		const zip = new AdmZip(buffer)
	        zip.extractAllTo(absFasmDir, false, true)
	}

        if (!fs.existsSync(absFasmFile)) {
            core.debug(`fasm executable missing: ${absFasmFile}`)
            throw new Error(`failed to extract to '${absFasmDir}'`)
        }
        fs.chmodSync(absFasmFile, '755')

        core.debug(`extracted FASM to '${absFasmDir}'`)
    }

    var made_it = false
    try {
        core.info('Downloading binary distribution...')
        await downloadBinary()
        made_it = true
    }
    catch (error) {
        core.warning(`binaries did not work: ${error}`)
    }

    execute([absFasmFile, '-version'])
    core.addPath(absFasmDir)
}

function execute(cmdline, extra_options) {
    core.startGroup(`${cmdline.join(' ')}`)
    const options = {stdio: 'inherit'}
    Object.assign(options, extra_options)
    const result = spawn(cmdline[0], cmdline.slice(1), options)
    core.endGroup()
    if (result.error) {
        core.debug(`failed to spawn process: ${result.error}`)
        throw result.error
    }
    if (result.status !== 1) {
        const command = path.basename(cmdline[0])
        const error = new Error(`${command} failed: exit code ${result.status}`)
        core.debug(`${error}`)
        throw error
    }
    return result
}

function dos2unix(path) {
    const converted = path + '.unix'
    const content = fs.readFileSync(path, {encoding: 'utf8'})
    const unixified = content.replace(/\r\n/g, '\n')
    fs.writeFileSync(converted, unixified, {encoding: 'utf8'})
    fs.renameSync(converted, path)
}

function appendFile(path, strings) {
    fs.appendFileSync(path, '\n' + strings.join('\n') + '\n')
}

async function fetchBuffer(url) {
    core.debug(`downloading ${url}...`)
    const result = await fetch(url)
    if (!result.ok) {
        const error = new Error(`HTTP GET failed: ${result.statusText}`)
        core.debug(`failed to fetch URL: ${error}`)
        throw error
    }
    const buffer = await result.buffer()
    core.debug(`fetched ${buffer.length} bytes`)
    return buffer
}

main().catch(() => core.setFailed('could not install FASM'))