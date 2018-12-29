import {
  closeTag,
  createBindingSelector,
  getChildrenNodes,
  getNodeAttributes,
  hasEachAttribute,
  hasIfAttribute,
  hasItsOwnTemplate,
  isCustomNode,
  isRootNode,
  isStaticNode,
  isTagNode,
  isTextNode,
  isVoidNode,
  nodeToString
} from './utils'
import cloneDeep from '../../utils/clone-deep'
import eachBinding from './bindings/each'
import ifBinding from './bindings/if'
import simpleBinding from './bindings/simple'
import tagBinding from './bindings/tag'

const BuildingState = Object.freeze({
  html: [],
  bindings: [],
  parent: null
})

/**
 * Nodes having bindings should be cloned and new selector properties should be added to them
 * @param   {RiotParser.Node} sourceNode - any kind of node parsed via riot parser
 * @param   {string} bindingsSelector - temporary string to identify the current node
 * @returns {RiotParser.Node} the original node parsed having the new binding selector attribute
 */
function createBindingsTag(sourceNode, bindingsSelector) {
  if (!bindingsSelector) return sourceNode

  return {
    ...sourceNode,
    // inject the selector bindings into the node attributes
    attributes: [{
      name: bindingsSelector
    }, ...getNodeAttributes(sourceNode)]
  }
}

/**
 * Create a generic dynamic node (text or tag) and generate its bindings
 * @param   {RiotParser.Node} sourceNode - any kind of node parsed via riot parser
 * @param   {stiring} sourceFile - source file path
 * @param   {string} sourceCode - original source
 * @param   {BuildingState} state - state representing the current building tree state during the recursion
 * @returns {Array} array containing the html output and bindings for the current node
 */
function createDynamicNode(sourceNode, sourceFile, sourceCode, state) {
  switch (true) {
  case isTextNode(sourceNode):
    // text nodes will not have any bindings
    return [nodeToString(sourceNode), []]
  default:
    return createTagWithBindings(sourceNode, sourceFile, sourceCode, state)
  }
}

/**
 * Create only a dynamic tag node with generating a custom selector and its bindings
 * @param   {RiotParser.Node} sourceNode - any kind of node parsed via riot parser
 * @param   {stiring} sourceFile - source file path
 * @param   {string} sourceCode - original source
 * @param   {BuildingState} state - state representing the current building tree state during the recursion
 * @returns {Array} array containing the html output and bindings for the current node
 */
function createTagWithBindings(sourceNode, sourceFile, sourceCode) {
  const bindingsSelector = isRootNode(sourceNode) ? null : createBindingSelector()
  const cloneNode = createBindingsTag(sourceNode, bindingsSelector)
  const tagOpeningHTML = nodeToString(cloneNode)

  switch(true) {
  // EACH bindings have prio 1
  case hasEachAttribute(cloneNode):
    return [tagOpeningHTML, [eachBinding(cloneNode, bindingsSelector, sourceFile, sourceCode)]]
  // IF bindings have prio 2
  case hasIfAttribute(cloneNode):
    return [tagOpeningHTML, [ifBinding(cloneNode, bindingsSelector, sourceFile, sourceCode)]]
  // TAG bindings have prio 3
  case isCustomNode(cloneNode):
    return [tagOpeningHTML, [tagBinding(cloneNode, bindingsSelector, sourceFile, sourceCode)]]
  // this node has expressions bound to it
  default:
    return [tagOpeningHTML, [simpleBinding(cloneNode, bindingsSelector, sourceFile, sourceCode)]]
  }
}

/**
 * Parse a node trying to extract its template and bindings
 * @param   {RiotParser.Node} sourceNode - any kind of node parsed via riot parser
 * @param   {stiring} sourceFile - source file path
 * @param   {string} sourceCode - original source
 * @param   {BuildingState} state - state representing the current building tree state during the recursion
 * @returns {Array} array containing the html output and bindings for the current node
 */
function parseNode(sourceNode, sourceFile, sourceCode, state) {
  // static nodes have no bindings
  if (isStaticNode(sourceNode)) return [nodeToString(sourceNode), []]
  return createDynamicNode(sourceNode, sourceFile, sourceCode, state)
}

/**
 * Build the template and the bindings
 * @param   {RiotParser.Node} sourceNode - any kind of node parsed via riot parser
 * @param   {stiring} sourceFile - source file path
 * @param   {string} sourceCode - original source
 * @param   {BuildingState} state - state representing the current building tree state during the recursion
 * @returns {Array} array containing the html output and the dom bindings
 */
export default function build(
  sourceNode,
  sourceFile,
  sourceCode,
  state
) {
  const [nodeHTML, nodeBindings] = parseNode(sourceNode, sourceFile, sourceCode, state)
  const childrenNodes = getChildrenNodes(sourceNode)
  const currentState = { ...cloneDeep(BuildingState), ...state }

  // mutate the original arrays
  currentState.html.push(...nodeHTML)
  currentState.bindings.push(...nodeBindings)

  // do recursion if
  // this tag has children and it has no special directives bound to it
  if (childrenNodes.length && !hasItsOwnTemplate(sourceNode)) {
    childrenNodes.forEach(node => build(node, sourceFile, sourceCode, { parent: sourceNode, ...currentState }))
  }

  // close the tag if it's not a void one
  if (isTagNode(sourceNode) && !isVoidNode(sourceNode)) {
    currentState.html.push(closeTag(sourceNode))
  }

  return [
    currentState.html.join(''),
    currentState.bindings
  ]
}