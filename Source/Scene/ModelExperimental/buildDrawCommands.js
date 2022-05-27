import BoundingSphere from "../../Core/BoundingSphere.js";
import Buffer from "../../Renderer/Buffer.js";
import BufferUsage from "../../Renderer/BufferUsage.js";
import clone from "../../Core/clone.js";
import defined from "../../Core/defined.js";
import DrawCommand from "../../Renderer/DrawCommand.js";
import IndexDatatype from "../../Core/IndexDatatype.js";
import Matrix4 from "../../Core/Matrix4.js";
import ModelExperimentalDrawCommands from "./ModelExperimentalDrawCommands.js";
import ModelExperimentalFS from "../../Shaders/ModelExperimental/ModelExperimentalFS.js";
import ModelExperimentalVS from "../../Shaders/ModelExperimental/ModelExperimentalVS.js";
import Pass from "../../Renderer/Pass.js";
import RenderState from "../../Renderer/RenderState.js";
import SceneMode from "../SceneMode.js";
import ShadowMode from "../ShadowMode.js";
import StencilConstants from "../StencilConstants.js";
import VertexArray from "../../Renderer/VertexArray.js";

const scratchBoundingSphere = new BoundingSphere();

/**
 * Builds the {@link ModelExperimentalDrawCommands} for a {@link ModelExperimentalPrimitive}
 * using its render resources.
 *
 * @param {PrimitiveRenderResources} primitiveRenderResources The render resources for a primitive.
 * @param {FrameState} frameState The frame state for creating GPU resources.
 *
 * @returns {ModelExperimentalDrawCommands} The generated ModelExperimentalDrawCommands.
 *
 * @private
 */
export default function buildDrawCommands(
  primitiveRenderResources,
  frameState
) {
  const shaderBuilder = primitiveRenderResources.shaderBuilder;
  shaderBuilder.addVertexLines([ModelExperimentalVS]);
  shaderBuilder.addFragmentLines([ModelExperimentalFS]);

  const model = primitiveRenderResources.model;
  const context = frameState.context;

  const indexBuffer = getIndexBuffer(primitiveRenderResources, frameState);

  const vertexArray = new VertexArray({
    context: context,
    indexBuffer: indexBuffer,
    attributes: primitiveRenderResources.attributes,
  });

  model._resources.push(vertexArray);

  let renderState = primitiveRenderResources.renderStateOptions;

  if (model.opaquePass === Pass.CESIUM_3D_TILE) {
    // Set stencil values for classification on 3D Tiles
    renderState = clone(renderState, true);
    renderState.stencilTest = StencilConstants.setCesium3DTileBit();
    renderState.stencilMask = StencilConstants.CESIUM_3D_TILE_MASK;
  }

  renderState = RenderState.fromCache(renderState);

  const shaderProgram = shaderBuilder.buildShaderProgram(frameState.context);
  model._resources.push(shaderProgram);

  const pass = primitiveRenderResources.alphaOptions.pass;
  const sceneGraph = model.sceneGraph;

  const modelMatrix = Matrix4.multiplyTransformation(
    sceneGraph.computedModelMatrix,
    primitiveRenderResources.runtimeNode.computedTransform,
    new Matrix4()
  );

  const primitiveBoundingSphere = BoundingSphere.clone(
    primitiveRenderResources.boundingSphere,
    scratchBoundingSphere
  );

  let boundingSphere;
  if (
    frameState.mode !== SceneMode.SCENE3D &&
    !frameState.scene3DOnly &&
    model._projectTo2D
  ) {
    const runtimePrimitive = primitiveRenderResources.runtimePrimitive;
    boundingSphere = runtimePrimitive.boundingSphere2D;
  } else {
    boundingSphere = BoundingSphere.transform(
      primitiveRenderResources.boundingSphere,
      modelMatrix,
      primitiveRenderResources.boundingSphere
    );
  }

  const count = primitiveRenderResources.count;

  const command = new DrawCommand({
    boundingVolume: boundingSphere,
    modelMatrix: modelMatrix,
    uniformMap: primitiveRenderResources.uniformMap,
    renderState: renderState,
    vertexArray: vertexArray,
    shaderProgram: shaderProgram,
    cull: model.cull,
    pass: pass,
    count: count,
    pickId: primitiveRenderResources.pickId,
    instanceCount: primitiveRenderResources.instanceCount,
    primitiveType: primitiveRenderResources.primitiveType,
    debugShowBoundingVolume: model.debugShowBoundingVolume,
    castShadows: ShadowMode.castShadows(model.shadows),
    receiveShadows: ShadowMode.receiveShadows(model.shadows),
  });

  return new ModelExperimentalDrawCommands({
    primitiveRenderResources: primitiveRenderResources,
    command: command,
    primitiveBoundingSphere: primitiveBoundingSphere,
  });
}

/**
 * @private
 */
function getIndexBuffer(primitiveRenderResources, frameState) {
  const wireframeIndexBuffer = primitiveRenderResources.wireframeIndexBuffer;
  if (defined(wireframeIndexBuffer)) {
    return wireframeIndexBuffer;
  }

  const indices = primitiveRenderResources.indices;
  if (!defined(indices)) {
    return undefined;
  }

  if (defined(indices.buffer)) {
    return indices.buffer;
  }

  const typedArray = indices.typedArray;
  const indexDatatype = IndexDatatype.fromSizeInBytes(
    typedArray.BYTES_PER_ELEMENT
  );

  return Buffer.createIndexBuffer({
    context: frameState.context,
    typedArray: typedArray,
    usage: BufferUsage.STATIC_DRAW,
    indexDatatype: indexDatatype,
  });
}
