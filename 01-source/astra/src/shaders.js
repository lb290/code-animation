// ASTRA shader assembly: GLSL lives in ./glsl/*.glsl (esbuild "text" loader).
// lit / bill / inst / add / post 系列与 CIELO 同源（原样复制）；space-sky.fs.glsl 是本世界新写的。
import head from './glsl/head.glsl';
import noise from './glsl/noise.glsl';
import litVs from './glsl/lit.vs.glsl';
import litFs from './glsl/lit.fs.glsl';
import instVs from './glsl/inst.vs.glsl';
import instFs from './glsl/inst.fs.glsl';
import billVs from './glsl/bill.vs.glsl';
import billFs from './glsl/bill.fs.glsl';
import addVs from './glsl/add.vs.glsl';
import addFs from './glsl/add.fs.glsl';
import skyVs from './glsl/sky.vs.glsl';
import skyFs from './glsl/space-sky.fs.glsl';
import postVs from './glsl/post.vs.glsl';
import brightFs from './glsl/bright.fs.glsl';
import blurFs from './glsl/blur.fs.glsl';
import compositeFs from './glsl/composite.fs.glsl';
import upscaleFs from './glsl/upscale.fs.glsl';

const P = head + noise;

export const LIT_VS = P + litVs;
export const DEPTH_VS = P + litVs;
export const LIT_FS = P + litFs;
export const DEPTH_FS = P + 'void main(){}';
export const INST_VS = P + instVs;
export const INST_FS = P + instFs;
export const BILL_VS = P + billVs;
export const BILL_FS = P + billFs;
export const ADD_VS = P + addVs;
export const ADD_FS = P + addFs;
export const SKY_VS = P + skyVs;
export const SKY_FS = P + skyFs;
export const POST_VS = P + postVs;
export const BRIGHT_FS = P + brightFs;
export const BLUR_FS = P + blurFs;
export const COMPOSITE_FS = P + compositeFs;
export const UPSCALE_FS = P + upscaleFs;
