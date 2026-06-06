/**
 * Build simple vehicle meshes from colored boxes — no external asset files, so
 * the app stays a self-contained static site. Geometry is in LOCAL coordinates
 * (nose along +X, wings along Y, up +Z); the manager sets the Primitive's
 * modelMatrix each frame to place it in the world.
 */
import {
  Primitive,
  GeometryInstance,
  BoxGeometry,
  VertexFormat,
  PerInstanceColorAppearance,
  ColorGeometryInstanceAttribute,
  Color,
  Cartesian3,
} from 'cesium';

/**
 * @param {Array<{min:number[], max:number[], color:string}>} boxes
 * @returns {Primitive}
 */
export function createBoxMesh(boxes) {
  const instances = boxes.map(
    (b) =>
      new GeometryInstance({
        geometry: new BoxGeometry({
          minimum: new Cartesian3(...b.min),
          maximum: new Cartesian3(...b.max),
          vertexFormat: VertexFormat.POSITION_AND_NORMAL,
        }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(b.color)),
        },
      }),
  );

  return new Primitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({ flat: false, translucent: false }),
    asynchronous: false, // we want it visible immediately on spawn
  });
}
