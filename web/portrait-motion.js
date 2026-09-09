/* Single-image portrait mesh animation. No image files are modified. */
(function (global) {
  'use strict';
  var VERTEX = `
    precision highp float;
    attribute vec2 aUV;
    varying vec2 vUV;
    uniform float uTime;
    uniform float uMotion;
    uniform float uRei;
    float band(float x, float a, float b, float c, float d) {
      return smoothstep(a,b,x) * (1.0-smoothstep(c,d,x));
    }
    void main() {
      vec2 p = aUV;
      float t = uTime;
      float breath = sin(t * 1.04719755);
      float sway = sin(t * 0.82673491);
      float headY = mix(0.235,0.18,uRei);
      vec2 faceCenter = vec2(mix(0.535,0.505,uRei),headY);
      // Strongly protect eyes, nose and mouth: face moves as one small rigid patch.
      vec2 f = (p-faceCenter)/vec2(0.20,mix(0.145,0.13,uRei));
      float face = 1.0-smoothstep(0.75,1.3,length(f));
      float upper = 1.0-smoothstep(0.76,1.0,p.y);
      float body = band(p.x,0.17,0.33,0.70,0.86) * smoothstep(0.34,0.47,p.y);
      vec2 delta = vec2(0.0016*sway,-0.0014*breath)*upper;
      // Ribcage rises, while waist stays planted. No whole-image CSS float.
      float chest = band(p.y,0.32,0.46,0.64,0.80)*body;
      delta.x += (p.x-0.5)*0.007*breath*chest;
      delta.y -= 0.0023*breath*chest;
      float side = smoothstep(0.12,0.25,abs(p.x-faceCenter.x));
      float longHair = band(p.y,0.14,0.27,0.61,0.76)*side;
      float shortHair = band(p.y,0.08,0.15,0.27,0.32)*side;
      float hair = mix(longHair,shortHair,uRei)*(1.0-face);
      float hairWave = sin(t*1.25663706-p.y*7.0+p.x*2.0);
      delta.x += hair*mix(0.010,0.006,uRei)*hairWave;
      delta.y += hair*0.0018*sin(t*1.14239733-p.y*5.0);
      // Small shoulder-pivot arc; gradual weights prevent detached arm seams.
      float armSide = smoothstep(0.13,0.27,abs(p.x-0.51));
      float arm = band(p.y,0.38,0.49,0.84,0.98)*armSide;
      float signSide = p.x < 0.51 ? -1.0 : 1.0;
      float angle = 0.008*sin(t*0.96664389+signSide*0.65);
      vec2 pivot = vec2(p.x < 0.51 ? 0.27 : 0.70,0.42);
      delta += vec2(-(p.y-pivot.y)*angle,(p.x-pivot.x)*angle)*arm;
      // Face exclusion also protects the mouth and eyes from hair/arm fields.
      vec2 rigidHead = vec2(0.0016*sway,-0.0014*breath);
      delta = mix(delta,rigidHead,face);
      // Keep texture perimeter fixed so the original frame never opens a gap.
      float edge = smoothstep(0.0,0.045,p.x)*(1.0-smoothstep(0.955,1.0,p.x));
      edge *= smoothstep(0.0,0.03,p.y)*(1.0-smoothstep(0.97,1.0,p.y));
      p += delta*uMotion*edge;
      gl_Position = vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0);
      vUV = aUV;
    }
  `;
  var FRAGMENT = `
    precision mediump float;
    varying vec2 vUV;
    uniform sampler2D uImage;
    void main() {
      vec4 c = texture2D(uImage,vUV);
      gl_FragColor = vec4(c.rgb*c.a,c.a);
    }
  `;
  function create(canvas, options) {
    options = options || {};
    var gl;
    try { gl = canvas.getContext('webgl', {alpha:true,premultipliedAlpha:true,antialias:true,depth:false,stencil:false}); }
    catch (_) { return null; }
    if (!gl) return null;
    var program, vertex, fragment, buffer, indices, texture = null;
    var dead = false, lost = false, active = true, ready = false, raf = 0, generation = 0;
    var pendingImage = null, explicitReduced = !!options.reducedMotion;
    var media = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var elapsed = 0, previous = 0, rei = 0;
    function disposeGL() {
      if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (indices) gl.deleteBuffer(indices);
      if (program) gl.deleteProgram(program);
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    }
    function compile(type, source) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader,source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
        gl.deleteShader(shader); throw new Error('Portrait shader compilation failed');
      }
      return shader;
    }
    var locations, count;
    try {
      vertex=compile(gl.VERTEX_SHADER,VERTEX); fragment=compile(gl.FRAGMENT_SHADER,FRAGMENT);
      program=gl.createProgram(); gl.attachShader(program,vertex); gl.attachShader(program,fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('Portrait shader link failed');
      var cols=48, rows=64, points=[], triangles=[];
      for (var y=0;y<=rows;y++) for (var x=0;x<=cols;x++) points.push(x/cols,y/rows);
      for (var j=0;j<rows;j++) for (var i=0;i<cols;i++) {
        var n=j*(cols+1)+i; triangles.push(n,n+1,n+cols+1,n+1,n+cols+2,n+cols+1);
      }
      count=triangles.length;
      buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);
      indices=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(triangles),gl.STATIC_DRAW);
      locations={uv:gl.getAttribLocation(program,'aUV'),time:gl.getUniformLocation(program,'uTime'),motion:gl.getUniformLocation(program,'uMotion'),rei:gl.getUniformLocation(program,'uRei'),image:gl.getUniformLocation(program,'uImage')};
      canvas.width=512; canvas.height=768;
    } catch (_) { disposeGL(); return null; }
    function reduced() { return explicitReduced || !!(media && media.matches); }
    function stop() { if (raf) global.cancelAnimationFrame(raf); raf=0; previous=0; }
    function fail(reason) {
      ready=false; stop();
      if (!dead) canvas.dispatchEvent(new CustomEvent('portraitmotionerror',{detail:{reason:reason}}));
    }
    function draw() {
      if (dead || lost || !ready) return;
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program); gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.enableVertexAttribArray(locations.uv); gl.vertexAttribPointer(locations.uv,2,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.uniform1i(locations.image,0); gl.uniform1f(locations.time,elapsed); gl.uniform1f(locations.motion,reduced()?0:1); gl.uniform1f(locations.rei,rei);
      gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_SHORT,0);
    }
    function tick(now) {
      raf=0;
      if (dead || lost || !active || document.hidden || !ready || reduced()) { previous=0; return; }
      if (previous) elapsed+=Math.min((now-previous)/1000,0.05);
      previous=now;
      try { draw(); } catch (_) { fail('render'); return; }
      raf=global.requestAnimationFrame(tick);
    }
    function reconcile() {
      stop();
      if (dead || lost || !ready) return;
      try { draw(); } catch (_) { fail('render'); return; }
      if (active && !document.hidden && !reduced()) raf=global.requestAnimationFrame(tick);
    }
    function setSource(src) {
      if (dead || lost) return;
      var token=++generation;
      if (pendingImage) { pendingImage.onload=null; pendingImage.onerror=null; }
      var img=new Image(); pendingImage=img;
      img.onload=function () {
        if (dead || lost || token!==generation) return;
        pendingImage=null;
        var next=gl.createTexture();
        try {
          gl.bindTexture(gl.TEXTURE_2D,next);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
          if (gl.getError()!==gl.NO_ERROR) throw new Error('Texture upload failed');
        } catch (_) { gl.deleteTexture(next); fail('image-upload'); return; }
        if (texture) gl.deleteTexture(texture);
        texture=next; rei=/(?:rei|ayanami)/i.test(String(src))?1:0; elapsed=0; ready=true;
        canvas.dispatchEvent(new CustomEvent('portraitmotionready'));
        reconcile();
      };
      img.onerror=function () { if (!dead && token===generation) { pendingImage=null; fail('image-load'); } };
      img.src=src;
    }
    function contextLost(event) { event.preventDefault(); lost=true; fail('webgl-context-lost'); }
    function destroy() {
      if (dead) return;
      dead=true; generation++; stop();
      if (pendingImage) { pendingImage.onload=null; pendingImage.onerror=null; pendingImage=null; }
      document.removeEventListener('visibilitychange',reconcile);
      canvas.removeEventListener('webglcontextlost',contextLost);
      if (media && media.removeEventListener) media.removeEventListener('change',reconcile);
      else if (media && media.removeListener) media.removeListener(reconcile);
      disposeGL();
    }
    document.addEventListener('visibilitychange',reconcile);
    canvas.addEventListener('webglcontextlost',contextLost);
    if (media && media.addEventListener) media.addEventListener('change',reconcile);
    else if (media && media.addListener) media.addListener(reconcile);
    if (options.src) setSource(options.src);
    return {setSource:setSource,setReducedMotion:function (value) {explicitReduced=!!value;reconcile();},setActive:function(value) {active=!!value;reconcile();},destroy:destroy};
  }
  global.PortraitMotion={create:create};
})(window);
