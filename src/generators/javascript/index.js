import {namedTypes, types} from '../../utils/build-types'
import {TAG_LOGIC_PROPERTY} from '../constants'
import composeSourcemaps from '../../utils/compose-sourcemaps'
import getPreprocessorTypeByAttribute from '../../utils/get-preprocessor-type-by-attribute'
import preprocess from '../../utils/preprocess-node'
import recast from 'recast'

const isExportDefaultStatement = namedTypes.ExportDefaultDeclaration.check

/**
 * Find the export default statement
 * @param   { Array } body - tree structure containing the program code
 * @returns { Object } node containing only the code of the export default statement
 */
function findExportDefaultStatement(body) {
  return body.find(isExportDefaultStatement)
}

/**
 * Find all the code in an ast program except for the export default statements
 * @param   { Array } body - tree structure containing the program code
 * @returns { Array } array containing all the program code except the export default expressions
 */
function filterNonExportDefaultStatements(body) {
  return body.filter(node => !isExportDefaultStatement(node))
}

/**
 * Get the body of the AST structure
 * @param   { Object } ast - ast object generated by recast
 * @returns { Array } array containing the program code
 */
function getProgramBody(ast) {
  return ast.program.body
}

/**
 * Extend the AST adding the new tag method containing our tag sourcecode
 * @param   { Object } ast - current output ast
 * @param   { Object } exportDefaultNode - tag export default node
 * @returns { Object } the output ast having the "tag" key extended with the content of the export default
 */
function extendTagProperty(ast, exportDefaultNode) {
  types.visit(ast, {
    visitProperty(path) {
      if (path.value.key.name === TAG_LOGIC_PROPERTY) {
        path.value.value = exportDefaultNode.declaration
        return false
      }

      this.traverse(path)
    }
  })

  return ast
}

/**
 * Generate the component javascript logic
 * @param   { Object } sourceNode - node generated by the riot compiler
 * @param   { string } source - original component source code
 * @param   { Object } options - user options
 * @param   { Output } output - current compiler output
 * @returns { Promise<Output> } - enhanced output with the result of the current generator
 */
export default async function javascript(sourceNode, source, options, { ast, map }) {
  const preprocessorName = getPreprocessorTypeByAttribute(sourceNode)
  const javascriptNode = sourceNode.text
  const preprocessorOutput = await preprocess('js', preprocessorName, options, source, javascriptNode)
  const generatedAst = recast.parse(preprocessorOutput.code, {
    sourceFileName: options.file,
    inputSourceMap: composeSourcemaps(map, preprocessorOutput.map)
  })
  const generatedAstBody = getProgramBody(generatedAst)
  const bodyWithoutExportDefault = filterNonExportDefaultStatements(generatedAstBody)
  const exportDefaultNode = findExportDefaultStatement(generatedAstBody)
  const outputBody = getProgramBody(ast)

  // add to the ast the "private" javascript content of our tag script node
  outputBody.unshift(...bodyWithoutExportDefault)

  // convert the export default adding its content to the "tag" property exported
  if (exportDefaultNode) extendTagProperty(ast, exportDefaultNode)

  return {
    ast,
    map,
    code: recast.print(ast).code
  }
}