import * as core from '@actions/core'
import {GetParametersByPathCommand, SSMClient} from '@aws-sdk/client-ssm'
import {writeFileSync} from 'fs'

async function run(): Promise<void> {
  try {
    const ssm = new SSMClient({})
    const paths = core.getInput('paths', {required: true}).split(',').map(function (value) {
      return value.trim();
    });
    const saveToEnvironment: Boolean = JSON.parse(
      core.getInput('save-to-environment', {required: true})
    )
    const prefix = core.getInput('prefix') || ''
    const delimiter = core.getInput('delimiter', {required: true})

    const params = {} as any
    let nextToken: string | undefined

    for (const path of paths) {
      const request = new GetParametersByPathCommand({
        Path: path,
        Recursive: JSON.parse(core.getInput('recursive', {required: true})),
        WithDecryption: JSON.parse(core.getInput('decrypt', {required: true}))
      })
      do {
        const result = await ssm.send(request)

        if (saveToEnvironment) {
          // eslint-disable-next-line i18n-text/no-en
          core.startGroup(`Exporting from Path ${path}`)
        }

        for (const parameter of result.Parameters!) {
          let name = parameter?.Name?.replace(path, '')
            .toUpperCase()
            .replace(/\//g, delimiter)
            .replace(/-/g, '_')
          name = `${prefix}${name}`
          params[name] = parameter.Value
          if (saveToEnvironment) {
            // eslint-disable-next-line i18n-text/no-en
            core.info(`Exporting variable ${name}`)
            core.exportVariable(name, parameter.Value)
            if (parameter.Value && parameter.Type === 'SecureString') {
              core.setSecret(parameter.Value)
            }
          }
        }

        if (saveToEnvironment) {
          core.endGroup()
        }
        nextToken = result.NextToken
        core.info(`nextToken ${result.NextToken}`)
        request.input.NextToken = nextToken
        core.info(`nextToken ${nextToken}`)
      } while (nextToken)
    }

    const fileName = core.getInput('file', {required: false})
    core.info(fileName)
    if (fileName) {
      // eslint-disable-next-line i18n-text/no-en
      core.info(`Writing to file ${fileName}`)

      writeFileSync(
        fileName,
        Object.keys(params)
          .map(k => `${k}=${params[k]}`)
          .join('\n')
      )
    }

    core.setOutput('ssm-params', JSON.stringify(params))
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    core.setFailed(error.message)
  }
}

run()