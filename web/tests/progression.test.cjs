const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../progression.js'),{Game,blankMap}=require('../engine.js');
test('18 distinct nodes with prerequisite, budget, level and ultimate exclusivity enforcement',()=>{
 assert.equal(Object.values(P.TREES).flat().length,18);
 assert.throws(()=>P.validateBuild('Asuka',['a-cannon-2'],900),/前置/);
 assert.throws(()=>P.validateBuild('Asuka',['a-cannon-1','a-mobility-1'],0),/技能点/);
 assert.throws(()=>P.validateBuild('Asuka',['a-cannon-1','a-cannon-2','a-cannon-3','a-guard-1','a-guard-2','a-guard-3'],3000),/终极/);
 assert.deepEqual(P.validateBuild('Rei',['r-phase-1','r-phase-1'],0),['r-phase-1']);
 assert.throws(()=>P.validateBuild('Rei',['a-cannon-1'],900),/不存在/);
});
test('normalize drops impossible build nodes and retains earned progression',()=>{
 const p=P.normalizeProfile({characters:{Asuka:{xp:600,nodes:['a-cannon-3','a-cannon-2','a-cannon-1','invalid']}}});
 assert.deepEqual(p.characters.Asuka.nodes,['a-cannon-1','a-cannon-2','a-cannon-3']);assert.equal(p.characters.Rei.xp,0);
});
test('Asuka branches change shots, movement during barrage, and shared shields',()=>{
 const g=new Game(blankMap(),{coop:true,nodes:{Asuka:['a-cannon-1','a-cannon-2','a-guard-1','a-guard-2']}}),p=g.players[0];
 g.step(.01,[{fire:true}]);assert.equal(g.bullets.filter(b=>b.team).length,2);assert.equal(p.maxHp,125);
 g.skill(p,'special');const x=p.x;g.step(.05,[{dir:1}]);assert.ok(p.x>x);
 g.skill(p,'ultimate');assert.ok(g.players[1].shield>0);assert.ok(g.effects.some(e=>e.kind==='shield'));
});
test('Rei phase and rescue nodes restore downed ally, leave both teleport effects',()=>{
 const g=new Game(blankMap(),{coop:true,characters:['Rei','Asuka'],nodes:{Rei:['r-phase-1','r-phase-2','r-phase-3']}}),p=g.players[0],a=g.players[1];
 a.hp=0;p.dir=1;g.skill(p,'special');assert.ok(a.hp>0);assert.equal(p.stats.rescues,1);assert.ok(p.shield>0);assert.equal(g.effects.filter(e=>e.kind==='teleport').length,2);
});
test('missile specialization changes projectile impact radius and splash damage',()=>{
 const g=new Game(blankMap(),{character:'Rei',nodes:['r-missile-1','r-missile-2','r-missile-3'],practice:true}),p=g.players[0];
 p.x=300;p.y=300;p.dir=1;g.enemies=[{id:'e1',team:0,x:360,y:300,r:18,hp:100,maxHp:100,type:1},{id:'e2',team:0,x:360,y:410,r:18,hp:200,maxHp:200,type:1}];
 g.skill(p,'ultimate');for(let i=0;i<4;i++)g.step(.05);assert.equal(g.enemies[1].hp,95);assert.ok(g.effects.some(e=>e.kind==='missile'&&e.radius===130));
});
test('practice targets stay stationary, respawn without win, preserve cumulative damage and can reset',()=>{
 const g=new Game(blankMap(),{practice:true}),e=g.enemies[0],p=g.players[0],x=e.x,y=e.y;
 g.damage(e,100,p.id);g.step(.05);assert.equal(e.hp,e.maxHp);assert.equal(g.status,'playing');assert.equal(p.stats.damage,50);
 for(let i=0;i<120;i++)g.step(.05);assert.equal(e.x,x);assert.equal(e.y,y);assert.equal(g.bullets.length,0);
 g.damage(p,100);assert.equal(p.hp,p.maxHp);g.setPracticeOptions({invincible:false});g.damage(p,100);g.step(.05);assert.equal(g.status,'playing');
 g.resetPractice();assert.equal(p.hp,p.maxHp);assert.equal(p.stats.damage,50);g.setPracticeOptions({noCooldown:true});p.cd.ultimate=100;g.step(.05);assert.equal(p.cd.ultimate,0);g.resetPractice({resetStats:true});assert.equal(p.stats.damage,0);assert.equal(g.time,0);
});
test('12 campaign stages are valid, distinct and hard mode fires stronger rounds',()=>{
 const {campaign,validateMap}=require('../engine.js');for(let m=0;m<4;m++){const stages=[0,1,2].map(s=>campaign(m,s));for(const map of stages)assert.doesNotThrow(()=>validateMap(map));assert.ok(stages[2].enemies.length>stages[1].enemies.length);assert.notDeepEqual(stages[0].tiles,stages[1].tiles);}
 const normal=new Game(blankMap()),hard=new Game(blankMap(),{difficulty:'hard'});normal.shoot(normal.enemies[0]);hard.shoot(hard.enemies[0]);assert.equal(hard.bullets[0].damage,normal.bullets[0].damage*1.4);
 normal.enemies[0].fire=0;hard.enemies[0].fire=0;normal.step(.01);hard.step(.01);assert.ok(hard.enemies[0].fire<normal.enemies[0].fire);
});
test('equipment affects actual shots, hit points, speed and cooldowns',()=>{
 const base=new Game(blankMap()),g=new Game(blankMap(),{gear:{Asuka:['pulse-coil','composite-armor','sync-relay']}}),p=g.players[0];
 assert.equal(p.maxHp,115);g.shoot(p);assert.equal(g.bullets[0].damage,22);g.skill(p,'ultimate');assert.equal(p.cd.ultimate,8.8);
 const speedy=new Game(blankMap(),{gear:{Asuka:['vector-thruster']}});const x=base.players[0].x;base.step(.05,[{dir:1}]);speedy.step(.05,[{dir:1}]);assert.ok(speedy.players[0].x-x>base.players[0].x-x);
});
test('profile retains equipment and currency with 12-stage unlock bounds',()=>{
 const p=P.normalizeProfile({coins:200,unlocked:12,inventory:['pulse-coil','pulse-coil'],equipment:{Asuka:{weapon:'pulse-coil'}},records:{wins:2,losses:1,history:[{mission:1}]}});
 assert.equal(p.coins,200);assert.equal(p.unlocked,12);assert.equal(p.inventory.length,1);assert.equal(p.equipment.Asuka.weapon,'pulse-coil');assert.equal(p.records.wins,2);
});
function weaponArena(ammo='AP',melee='blade'){
 const g=new Game(blankMap(),{coop:true,practice:true,loadouts:{Asuka:{ammo,melee}}});g.players[0].x=300;g.players[0].y=300;g.players[0].dir=1;
 g.enemies=[{id:'e1',team:0,x:360,y:300,r:18,hp:200,maxHp:200,type:3},{id:'e2',team:0,x:370,y:350,r:18,hp:200,maxHp:200,type:1}];return g;
}
function hitRound(g){g.shoot(g.players[0]);for(let i=0;i<4;i++)g.step(.05);}
test('AP specializes against heavy enemies while HE splashes enemies without harming ally',()=>{
 const ap=weaponArena();hitRound(ap);assert.equal(ap.enemies[0].hp,174);assert.equal(ap.enemies[1].hp,200);
 const he=weaponArena('HE');he.setPracticeOptions({invincible:false});he.players[1].x=370;he.players[1].y=340;hitRound(he);assert.equal(he.enemies[0].hp,186);assert.equal(he.enemies[1].hp,188);assert.equal(he.players[1].hp,100);assert.ok(he.effects.some(e=>e.kind==='explosion'));
});
test('HESH applies a timed defense debuff that amplifies subsequent hits then expires',()=>{
 const g=weaponArena('HESH');hitRound(g);const e=g.enemies[0];assert.equal(e.hp,184);g.damage(e,20,g.players[0].id);assert.equal(e.hp,159);for(let i=0;i<85;i++)g.step(.05);g.damage(e,20,g.players[0].id);assert.equal(e.hp,139);
});
test('blade sweeps several frontal enemies, spear chooses one at longer reach, cooldown enforced',()=>{
 const blade=weaponArena();blade.enemies[1].y=340;blade.melee(blade.players[0]);assert.equal(blade.enemies[0].hp,168);assert.equal(blade.enemies[1].hp,168);assert.equal(blade.players[0].stats.meleeHits,2);blade.melee(blade.players[0]);assert.equal(blade.players[0].stats.melee,1);
 const spear=weaponArena('AP','spear');spear.enemies[0].x=420;spear.enemies[1].x=435;spear.enemies[1].y=300;spear.melee(spear.players[0]);assert.equal(spear.enemies[0].hp,148);assert.equal(spear.enemies[1].hp,200);assert.ok(spear.effects.some(e=>e.kind==='spear'&&e.dir===1&&e.radius===145));
});
test('melee cannot hit behind player or through walls; input and practice cooldown reset work',()=>{
 const g=weaponArena();g.enemies[0].x=250;g.enemies[1].x=370;g.enemies[1].y=300;g.map.tiles[5][6]=2;g.step(.01,[{melee:true}]);assert.equal(g.players[0].stats.meleeHits,0);g.setPracticeOptions({noCooldown:true});g.step(.01,[{melee:true}]);assert.equal(g.players[0].stats.melee,2);
});
test('profile normalizes weapon choices and appearance',()=>{
 const p=P.normalizeProfile({loadouts:{Asuka:{ammo:'HE',melee:'spear'},Rei:{ammo:'bad',melee:'bad'}},appearance:{pilot:'Rei',reducedMotion:true}});assert.equal(p.loadouts.Asuka.ammo,'HE');assert.equal(p.loadouts.Rei.ammo,'AP');assert.equal(p.loadouts.Rei.melee,'spear');assert.deepEqual(p.appearance,{pilot:'Rei',reducedMotion:true});
});
test('facing armor rewards rear shots and reports actual impact damage',()=>{
 const front=weaponArena(),side=weaponArena(),rear=weaponArena();front.enemies[0].dir=3;side.enemies[0].dir=0;rear.enemies[0].dir=1;
 for(const g of [front,side,rear])hitRound(g);
 assert.ok(front.enemies[0].hp>side.enemies[0].hp);assert.ok(side.enemies[0].hp>rear.enemies[0].hp);
 const impact=rear.effects.find(e=>e.kind==='impact');assert.equal(impact.label,'背部命中');assert.equal(impact.amount,200-rear.enemies[0].hp);assert.ok(rear.enemies[0].exposedUntil>rear.time);
});
test('AP resists frontal armor better, HE is angle independent and direct damage stays unchanged',()=>{
 const ap=weaponArena('AP'),hesh=weaponArena('HESH'),heFront=weaponArena('HE'),heRear=weaponArena('HE');
 ap.enemies[0].dir=hesh.enemies[0].dir=heFront.enemies[0].dir=3;heRear.enemies[0].dir=1;
 for(const g of [ap,hesh,heFront,heRear])hitRound(g);
 assert.ok((200-ap.enemies[0].hp)/26>(200-hesh.enemies[0].hp)/16);assert.equal(heFront.enemies[0].hp,heRear.enemies[0].hp);
 const e=ap.enemies[0],before=e.hp;ap.damage(e,20);assert.equal(before-e.hp,20);
});
test('skill energy is consumed only on successful casts and regenerates at eight per second',()=>{
 const g=weaponArena(),p=g.players[0];g.skill(p,'heal');assert.equal(p.energy,100);p.energy=5;g.skill(p,'ultimate');assert.equal(p.energy,5);assert.equal(p.cd.ultimate,0);assert.ok(g.events.includes('noenergy'));
 g.step(.05);assert.equal(p.energy,5.4);p.energy=100;g.skill(p,'ultimate');assert.equal(p.energy,60);g.skill(p,'ultimate');assert.equal(p.energy,60);
 g.setPracticeOptions({noCooldown:true});p.energy=0;g.step(.05,[{ultimate:true}]);assert.equal(p.energy,100);assert.ok(p.shield>0);
});
test('active sync relay requires equipped module and provides energy with its own cooldown',()=>{
 const absent=weaponArena(),p=absent.players[0];p.energy=10;absent.useItem(p);assert.equal(p.energy,10);assert.equal(p.cd.item,0);
 const g=new Game(blankMap(),{gear:{Asuka:['sync-relay']}}),a=g.players[0];a.energy=10;g.useItem(a);assert.equal(a.energy,40);assert.equal(a.shield,1);assert.equal(a.cd.item,30);g.useItem(a);assert.equal(a.energy,40);
});
test('live ammo selection validates enumeration and spear slow halves enemy movement',()=>{
 const g=weaponArena('AP','spear');g.step(.01,[{ammo:'HE'}]);assert.equal(g.players[0].loadout.ammo,'HE');g.step(.01,[{ammo:'invalid'}]);assert.equal(g.players[0].loadout.ammo,'HE');g.melee(g.players[0]);assert.ok(g.enemies[0].slowUntil>g.time);
 const normal=new Game(blankMap()),slow=new Game(blankMap());for(const game of [normal,slow]){const e=game.enemies[0];e.x=600;e.y=330;e.dir=1;e.think=10;e.fire=10;}slow.enemies[0].slowUntil=1.2;
 normal.step(.05);slow.step(.05);assert.ok(Math.abs((normal.enemies[0].x-600)/2-(slow.enemies[0].x-600))<1e-8);
});
test('opening stage restores original Round 1 cells and art transitions after two stages',()=>{
 const {campaign}=require('../engine.js'),m=campaign(0,0);assert.equal(m.width,10);assert.equal(m.height,10);assert.ok(m.tiles.flat().every(t=>t===0));assert.deepEqual(m.spawns,[{x:2,y:5},{x:9,y:5}]);assert.deepEqual(m.enemies,[{x:0,y:3,type:1},{x:2,y:0,type:2},{x:7,y:0,type:1},{x:9,y:3,type:2}]);assert.equal(campaign(0,1).artSet,'legacy');assert.equal(campaign(0,2).artSet,'new');assert.equal(campaign(2,0).artSet,'new');
});
function bossArena(coop=true){const {campaign}=require('../engine.js'),g=new Game(campaign(0,2),{coop});for(const e of g.enemies){e.fire=999;e.think=999;}for(const p of g.players)p.shield=999;return g;}
test('Boss shield needs two different living players holding synchronization pads',()=>{
 const solo=bossArena(false),boss=solo.enemies.find(e=>e.boss);solo.damage(boss,100,'p0');assert.equal(boss.hp,600);for(let i=0;i<40;i++)solo.step(.05);assert.equal(solo.cooperation.openFor,0);
 const g=bossArena(),b=g.enemies.find(e=>e.boss);assert.equal(g.cooperation.pads.length,2);for(let i=0;i<31;i++)g.step(.05);assert.ok(g.cooperation.openFor>7);g.damage(b,100,'p0');assert.equal(b.hp,500);
 g.players[0].x-=70;for(let i=0;i<165;i++)g.step(.05);assert.equal(g.cooperation.openFor,0);g.damage(b,100,'p0');assert.equal(b.hp,500);
});
test('Boss dies only in opening, completes cleared battle, and practice bypasses mechanism',()=>{
 const g=bossArena();for(let i=0;i<31;i++)g.step(.05);for(const e of g.enemies)g.damage(e,10000,'p0');g.step(.05);assert.equal(g.status,'won');
 const {campaign}=require('../engine.js'),practice=new Game(campaign(0,2),{practice:true}),boss=practice.enemies.find(e=>e.boss);practice.damage(boss,100,'p0');assert.equal(boss.hp,500);practice.step(.05);assert.equal(practice.status,'playing');
});
test('Boss shoots a readable three-projectile fan at reduced speed',()=>{
 const g=bossArena(),boss=g.enemies.find(e=>e.boss);boss.fire=0;g.step(.05);assert.ok(g.effects.some(e=>e.kind==='warning'));for(let i=0;i<14;i++)g.step(.05);const fan=g.bullets.filter(b=>b.boss);assert.equal(fan.length,3);assert.equal(fan[0].speed,240);assert.notEqual(fan[0].dx,fan[1].dx);assert.ok(g.effects.some(e=>e.kind==='barrage'));
});
test('artillery warns for 0.7 seconds before firing and repairs never revive dead allies',()=>{
 const g=weaponArena();g.practice=false;const e=g.enemies[0];e.type=2;e.dir=1;e.fire=0;e.warning=0;e.think=99;g.enemies[1].dir=0;g.enemies[1].fire=999;g.enemies[1].think=999;
 g.step(.05);assert.equal(g.bullets.length,0);assert.ok(g.effects.some(f=>f.kind==='warning'&&f.max===.7));for(let i=0;i<12;i++)g.step(.05);assert.equal(g.bullets.length,0);for(let i=0;i<3;i++)g.step(.05);assert.ok(g.bulletSeq>0);assert.equal(e.warning,0);
 const repair=weaponArena();repair.practice=false;repair.enemies=[{id:'node',type:4,team:0,x:600,y:300,hp:70,maxHp:70,r:18,repair:.01,fire:99,think:99},{id:'ally',type:1,team:0,x:660,y:300,hp:10,maxHp:50,r:18,dir:0,fire:99,think:99},{id:'dead',type:1,team:0,x:650,y:350,hp:0,maxHp:50,r:18},{id:'far',type:1,team:0,x:1000,y:300,hp:10,maxHp:50,r:18,dir:0,fire:99,think:99}];repair.step(.05);assert.equal(repair.enemies[1].hp,22);assert.equal(repair.enemies[2].hp,0);assert.equal(repair.enemies[3].hp,10);
});
test('sequential puzzle requires Asuka power before Rei activation and blocks early completion',()=>{
 const {campaign}=require('../engine.js'),g=new Game(campaign(1,1),{coop:true,characters:['Rei','Asuka']});for(const e of g.enemies)g.damage(e,10000,'p0');
 for(let i=0;i<24;i++)g.step(.05);assert.equal(g.cooperation.puzzle.solved,false);assert.equal(g.status,'playing');const [a,b]=g.players;[a.x,b.x]=[b.x,a.x];[a.y,b.y]=[b.y,a.y];for(let i=0;i<21;i++)g.step(.05);assert.equal(g.cooperation.puzzle.solved,true);assert.equal(g.status,'won');assert.deepEqual(g.cooperation.puzzle.gates,[]);
});
