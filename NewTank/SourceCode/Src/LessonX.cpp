/////////////////////////////////////////////////////////////////////////////////
//
//
//
//
/////////////////////////////////////////////////////////////////////////////////
#include <Stdio.h>
#include "CommonClass.h"
#include "LessonX.h"
////////////////////////////////////////////////////////////////////////////////
//
//
CGameMain		g_GameMain;	

//==============================================================================
//
// 大体的程序流程为：GameMainLoop函数为主循环函数，在引擎每帧刷新屏幕图像之后，都会被调用一次。

//==============================================================================
//
// 构造函数
CGameMain::CGameMain()
{
	m_iGameState			=	1;
	m_iBulletNum			=	0;
	TankPlayer_Asuka 		= 	new CTankPlayer1("TankPlayer_Asuka");
	TankPlayer_Rei 			= 	new CTankPlayer2("TankPlayer_Rei");
	m_fGameTime				=	0;
}
//==============================================================================
//
// 析构函数
CGameMain::~CGameMain()
{
}
//=============================================================================
//
// 游戏关卡
// [0] 坦克种类 [1] 坦克位置X [2] 坦克位置Y [3]坦克出现时间
int Round_1[4][3]=
{
	{1,2,3},{2,1,3},{1,4,0},{2,3,3}
};

//=============================================================================
//
// 游戏地图
// [0] X坐标 [1] Y坐标 [2] 贴图编号 [3] 贴图性质
int Map_1[157][4]=
{
{0,9,18,1},
{1,9,18,1},
{2,9,14,1},
{3,9,18,1},
{4,9,18,1},
{5,9,1,2},
{6,9,18,1},
{7,9,14,1},
{8,9,18,1},
{9,9,18,1},
{0,8,18,1},
{1,8,18,1},
{2,8,14,1},
{3,8,18,1},
{4,8,18,1},
{5,8,1,2},
{6,8,18,1},
{7,8,14,1},
{8,8,18,1},
{9,8,18,1},
{0,7,18,1},
{1,7,18,1},
{2,7,18,1},
{3,7,18,1},
{4,7,18,1},
{5,7,1,1},
{6,7,18,1},
{7,7,18,1},
{8,7,18,1},
{9,7,18,1},
{0,6,14,1},
{1,6,14,1},
{2,6,18,1},
{3,6,18,1},
{4,6,18,1},
{5,6,1,2},
{6,6,18,1},
{7,6,18,1},
{8,6,14,1},
{9,6,14,1},
{0,5,18,1},
{1,5,18,1},
{2,5,18,1},
{3,5,18,1},
{4,5,1,2},
{5,5,1,2},
{6,5,18,1},
{7,5,18,1},
{8,5,18,1},
{9,5,18,1},
{0,4,18,1},
{1,4,18,1},
{2,4,18,1},
{3,4,1,2},
{4,4,1,2},
{5,4,18,1},
{6,4,18,1},
{7,4,14,2},
{8,4,18,1},
{9,4,18,1},
{0,3,18,1},
{1,3,18,1},
{2,3,18,1},
{3,3,1,2},
{4,3,18,1},
{5,3,18,1},
{6,3,14,2},
{7,3,14,2},
{8,3,18,1},
{9,3,18,1},
{0,2,18,1},
{1,2,14,2},
{2,2,18,1},
{3,2,1,1},
{4,2,18,1},
{5,2,18,1},
{6,2,18,1},
{7,2,18,1},
{8,2,18,1},
{9,2,18,1},
{0,1,18,1},
{1,1,14,2},
{2,1,18,1},
{3,1,1,2},
{4,1,18,1},
{5,1,18,1},
{6,1,18,1},
{7,1,18,1},
{8,1,18,1},
{9,1,18,1},
{0,0,18,1},
{1,0,18,1},
{2,0,18,1},
{3,0,1,2},
{4,0,18,1},
{5,0,18,1},
{6,0,18,1},
{7,0,14,1},
{8,0,18,1},
{9,0,18,1},
{4,7,53,1},
{6,7,55,1},
{7,4,8,2},
{6,3,32,2},
{7,3,12,2},
{1,2,8,2},
{2,2,53,1},
{4,2,55,1},
{1,1,16,2},
{7,3,23,2},
{2,9,19,1},
{5,9,15,2},
{7,9,19,1},
{2,8,10,1},
{5,8,15,2},
{7,8,10,1},
{5,7,15,1},
{0,6,26,1},
{1,6,17,1},
{5,6,15,2},
{8,6,19,1},
{9,6,26,1},
{4,5,9,2},
{5,5,12,2},
{3,4,9,2},
{4,4,12,2},
{4,4,23,2},
{3,3,15,2},
{3,2,15,1},
{3,1,15,2},
{3,0,15,2},
{7,0,34,1},
{2,9,17,1},
{5,9,13,2},
{7,9,17,1},
{2,8,17,1},
{2,8,19,1},
{5,8,13,2},
{7,8,17,1},
{7,8,19,1},
{5,7,13,1},
{0,6,10,1},
{1,6,10,1},
{1,6,26,1},
{5,6,13,2},
{8,6,26,1},
{8,6,10,1},
{9,6,10,1},
{4,5,2,2},
{5,5,23,2},
{3,4,2,2},
{3,3,13,2},
{3,2,13,1},
{3,1,13,2},
{3,0,13,2},
{3,2,54,1}, //qiao
{5,7,54,1},

};

//==============================================================================
//
// 游戏主循环，此函数将被不停的调用，引擎每刷新一次屏幕，此函数即被调用一次
// 用以处理游戏的开始、进行中、结束等各种状态. 
// 函数参数fDeltaTime : 上次调用本函数到此次调用本函数的时间间隔，单位：秒
void CGameMain::GameMainLoop( float	fDeltaTime )
{
	switch( GetGameState() )
	{
		// 初始化游戏，清空上一局相关数据
	case 1:
		{
			GameInit();
			SetGameState(2); // 初始化之后，将游戏状态设置为进行中
		}
		break;

		// 游戏进行中，处理各种游戏逻辑
	case 2:
		{
			// TODO 修改此处游戏循环条件，完成正确游戏逻辑
			if( true )
			{
				GameRun( fDeltaTime );
			}
			else // 游戏结束。调用游戏结算函数，并把游戏状态修改为结束状态
			{				
				SetGameState(0);
				GameEnd();
			}
		}
		break;

		// 游戏结束/等待按空格键开始
	case 0:
	default:
		break;
	};
}
//=============================================================================
//
// 每局开始前进行初始化，清空上一局相关数据
void CGameMain::GameInit()
{
	TankPlayer_Asuka->Init();
	TankPlayer_Rei->Init();
	AddEnemy(Round_1);
	LoadGameMap(Map_1,1);
	ShowMeTheInfo(1);
}
//=============================================================================
//
// 每局游戏进行中
void CGameMain::GameRun( float fDeltaTime )
{
	m_fGameTime+=fDeltaTime;
	TankPlayer_Asuka->TankLoop(fDeltaTime);
	TankPlayer_Rei->TankLoop(fDeltaTime);
	
	//敌人出生
	for (int i=0;i<EnemyBox.size();i++)
		{
			if (EnemyBox[i]->GetEnemyBornTime()<=m_fGameTime&&EnemyBox[i]->GetEnemyBorn()==false)
				{
					EnemyBox[i]->Born();
				}
		}
	for (i=0;i<EnemyBox.size();i++)
		{
			if (EnemyBox[i]->GetEnemyBorn()==true)
				{
					EnemyBox[i]->Loop(fDeltaTime);
				}
		}
	//划线
	for (i=0;i<11;i+=2)
		{
			CSystem::DrawLine(-37.5,-3.75*i,37.5,-3.75*i,1,1,255,0,0,255);
			CSystem::DrawLine(-37.5,3.75*i,37.5,3.75*i,1,1,255,0,0,255);
			CSystem::DrawLine(-3.75*i,-37.5,-3.75*i,37.5,1,1,255,0,0,255);
			CSystem::DrawLine(3.75*i,-37.5,3.75*i,37.5,1,1,255,0,0,255);
		}
}
//=============================================================================
//
// 本局游戏结束
void CGameMain::GameEnd()
{
}
//==========================================================================
//
// 鼠标移动
// 参数 fMouseX, fMouseY：为鼠标当前坐标
void CGameMain::OnMouseMove( const float fMouseX, const float fMouseY )
{
	
}
//==========================================================================
//
// 鼠标点击
// 参数 iMouseType：鼠标按键值，见 enum MouseTypes 定义
// 参数 fMouseX, fMouseY：为鼠标当前坐标
void CGameMain::OnMouseClick( const int iMouseType, const float fMouseX, const float fMouseY )
{
	
}
//==========================================================================
//
// 鼠标弹起
// 参数 iMouseType：鼠标按键值，见 enum MouseTypes 定义
// 参数 fMouseX, fMouseY：为鼠标当前坐标
void CGameMain::OnMouseUp( const int iMouseType, const float fMouseX, const float fMouseY )
{
	
}
//==========================================================================
//
// 键盘按下
// 参数 iKey：被按下的键，值见 enum KeyCodes 宏定义
// 参数 iAltPress, iShiftPress，iCtrlPress：键盘上的功能键Alt，Ctrl，Shift当前是否也处于按下状态(0未按下，1按下)
void CGameMain::OnKeyDown( const int iKey, const bool bAltPress, const bool bShiftPress, const bool bCtrlPress )
{	
	if(iKey==KEY_W||iKey==KEY_A||iKey==KEY_S||iKey==KEY_D)
		TankPlayer_Asuka->OnMove(iKey,true);
	if (iKey==KEY_UP||iKey==KEY_DOWN||iKey==KEY_RIGHT||iKey==KEY_LEFT)
		TankPlayer_Rei->OnMove(iKey,true);
	if (iKey==KEY_SPACE)
		TankPlayer_Asuka->OnFire();
	if (iKey==KEY_NUMPAD0)
		TankPlayer_Rei->OnFire();
	if (iKey==KEY_E)
		TankPlayer_Asuka->OnHeal();
}
//==========================================================================
//
// 键盘弹起
// 参数 iKey：弹起的键，值见 enum KeyCodes 宏定义
void CGameMain::OnKeyUp( const int iKey )
{
	if(iKey==KEY_W||iKey==KEY_A||iKey==KEY_S||iKey==KEY_D)
		TankPlayer_Asuka->OnMove(iKey,false);
	if (iKey==KEY_UP||iKey==KEY_DOWN||iKey==KEY_RIGHT||iKey==KEY_LEFT)
		TankPlayer_Rei->OnMove(iKey,false);
}
//===========================================================================
//
// 精灵与精灵碰撞
// 参数 szSrcName：发起碰撞的精灵名字
// 参数 szTarName：被碰撞的精灵名字
void CGameMain::OnSpriteColSprite( const char *szSrcName, const char *szTarName )
{
	if (strstr(szSrcName,"TankPlayer")!=NULL)
		{
			if (strcmp(szSrcName,"TankPlayer_Asuka")==0)
				{
					if (strstr(szTarName,"Map")!=NULL)
						{
							TankPlayer_Asuka->OnColMap(FindMapByName(szTarName)->GetTanksTrans());
						}
					else if (strcmp(szTarName,"TankPlayer_Rei")==0||strstr(szTarName,"Enemy_")!=NULL)
						{
							TankPlayer_Asuka->OnColTank();
						}
				}
			else if (strcmp(szSrcName,"TankPlayer_Rei")==0)
				{
					if (strstr(szTarName,"Map")!=NULL)
						{
							TankPlayer_Rei->OnColMap(FindMapByName(szTarName)->GetTanksTrans());
						}
					else if (strcmp(szTarName,"TankPlayer_Asuka")==0||strstr(szTarName,"Enemy_")!=NULL)
						{
							TankPlayer_Rei->OnColTank();
						}
				}
		}
	else if (strstr(szSrcName,"Enemy_")!=NULL)
		{
			if (strstr(szTarName,"Map")!=NULL)
				{
					FindEnemyByName(szSrcName)->OnColMap(FindMapByName(szTarName)->GetTanksTrans());
				}
			else if (strstr(szTarName,"TankPlayer")!=NULL||strstr(szTarName,"Enemy_")!=NULL)
				{
					FindEnemyByName(szSrcName)->OnColTank();
				}
		}
	else if (strstr(szSrcName,"Bullet_")!=NULL)
		{
			if (strstr(szTarName,"Enemy_")!=NULL)
				{
					FindEnemyByName(szTarName)->OnColBullet(FindBulletByName(szSrcName)->GetOwner(),FindBulletByName(szSrcName)->GetAttack());
					FindBulletByName(szSrcName)->DeleteSprite();
				}
			else if(strcmp(szTarName,"TankPlayer_Asuka")==0)
				{
					TankPlayer_Asuka->OnColBullet(FindBulletByName(szSrcName)->GetOwner(),FindBulletByName(szSrcName)->GetAttack());
					FindBulletByName(szSrcName)->DeleteSprite();
				}
			else if(strcmp(szTarName,"TankPlayer_Rei")==0)
				{
					TankPlayer_Rei->OnColBullet(FindBulletByName(szSrcName)->GetOwner(),FindBulletByName(szSrcName)->GetAttack());
					FindBulletByName(szSrcName)->DeleteSprite();
				}
		}
}
//===========================================================================
//
// 精灵与世界边界碰撞
// 参数 szName：碰撞到边界的精灵名字
// 参数 iColSide：碰撞到的边界 0 左边，1 右边，2 上边，3 下边
void CGameMain::OnSpriteColWorldLimit( const char *szName, const int iColSide )
{
	if (strstr(szName,"Enemy_")!=NULL)
		{
			FindEnemyByName(szName)->OnMove(CSystem::RandomRange(1,4));
		}
}
//===========================================================================
//
// 添加子弹函数
// 参数 iDir：子弹方向
// 参数 fPosX,fPosY: 子弹起始位置
// 参数 iOwner: 子弹归属
void CGameMain::AddBullet( int iDir,float fPosX,float fPosY ,int iOwner,float fAttack)
{
	char* szName = CSystem::MakeSpriteName("Bullet_",m_iBulletNum);//创建子弹名字
	CBullet* pBullet = new CBullet(szName);
	pBullet->CloneSprite("Bullet");
	pBullet->SetSpritePosition(fPosX,fPosY);
	pBullet->SetSpriteCollisionActive(1,0);//设置为可以接受和发生碰撞
	pBullet->SetAttack(fAttack);
	pBullet->OnMove(iDir);
	pBullet->SetSpriteWorldLimit(WORLD_LIMIT_KILL, -37.5, -37.5, 37.5, 37.5);
	m_iBulletNum++; //子弹个数加1
	if(iOwner == 1)
		{
			pBullet->SetOwner(1);//1表示我方坦克发射的子弹
		}
	else
		{
			pBullet->SetOwner(0); //0表示敌方坦克发射的子弹
		}
	BulletBox.push_back(pBullet);
}
//===========================================================================
//
// 将敌人加入关卡
// 参数 round: 关卡
void CGameMain::AddEnemy(int round[][3])
{
	for (int i=0;round[i][0];i++)
		{
			int enemyspecie= round[i][0];
			int bornplace = round[i][1];
			int borntime = round[i][2];
			char* szName = CSystem::MakeSpriteName("Enemy_",i);
			CTankEnemy* enemy = new CTankEnemy(szName);
			char* tmpName = CSystem::MakeSpriteName("Enemy",enemyspecie);
			enemy->CloneSprite(tmpName);
			enemy->SetEnemySpecies(enemyspecie);
			enemy->SetEnemyPlace(bornplace);
			enemy->SetEnemtBornTime(borntime);
			EnemyBox.push_back(enemy);
		}
}

//===========================================================================
//
// 加载地图
// 参数 map: 地图
// 参数 num：关卡编号
void CGameMain::LoadGameMap(int map[][4],int num)
{
	char* mapnum = CSystem::MakeSpriteName("Map_",num);
	char* mapnum_1 = strcat(mapnum,"_");
	char* mapnum_round = CSystem::MakeSpriteName("Map_Round_",num);
	char* mapnum_round_1 = strcat(mapnum_round,"_");
	for (int i=0;map[i][3]!='\0';i++)
		{
			int px = map[i][0];
			int py = map[i][1];
			int chartnum = map[i][2];
			int chartproperty = map[i][3];
			char* szName = CSystem::MakeSpriteName(mapnum_round_1 ,i);
			CMap* map = new CMap(szName);
			char* tmpName = CSystem::MakeSpriteName(mapnum_1,chartnum);
			map->CloneSprite(tmpName);
			map->SetNewPosX(px);
			map->SetNewPosY(py);
			map->SetChartlet(chartnum);
			map->SetProperty(chartproperty);
			map->Init();
			MapBox.push_back(map);
		}
}
//===========================================================================
//
// 找到地图
// 参数 szName: 地图名字
CMap* CGameMain::FindMapByName(const char* szName)//根据名字查找到对象
{
	for(int i=0; i<MapBox.size(); i++)
	{
			if(strcmp(szName,MapBox[i]->GetName())==0)
			{
				return MapBox[i];
			}
	}
	return NULL;
}
//===========================================================================
//
// 找到敌人
// 参数 szname: 敌人名字
CTankEnemy* CGameMain::FindEnemyByName(const char* szName)//根据名字查找到对象
{
	for(int i=0; i<EnemyBox.size(); i++)
	{
			if(strcmp(szName,EnemyBox[i]->GetName())==0)
			{
				return EnemyBox[i];
			}
	}
	return NULL;
}
//===========================================================================
//
// 找到子弹
// 参数 szname: 子弹名字
CBullet* CGameMain::FindBulletByName(const char* szName)//根据名字查找到对象
{
	for(int i=0; i<BulletBox.size(); i++)
	{
			if(strcmp(szName,BulletBox[i]->GetName())==0)
			{
				return BulletBox[i];
			}
	}
	return NULL;
}
//===========================================================================
//
// 显示
// 参数 num: 关卡
void CGameMain::ShowMeTheInfo(int num)
{
	char * mapname = CSystem::MakeSpriteName("MapCover_",num);
	CSprite* MapCover =new CSprite("MapCover");
	MapCover->CloneSprite(mapname);
	MapCover->SetSpritePosition(0,0);
	InfoBox.push_back(MapCover);

	CSprite* FireCD1 = new CSprite("FireCD1");
	FireCD1->CloneSprite("FireCD");
	FireCD1->SetSpritePosition(-44.375,3.75);
	InfoBox.push_back(FireCD1);
	CSprite* FireCD2 = new CSprite("FireCD2");
	FireCD2->CloneSprite("FireCD");
	FireCD2->SetSpritePosition(44.375,3.75);
	InfoBox.push_back(FireCD2);

	CSprite* HealCD1 = new CSprite("HealCD1");
	HealCD1->CloneSprite("HealCD");
	HealCD1->SetSpritePosition(-44.375,11.25);
	InfoBox.push_back(HealCD1);
	CSprite* HealCD2 = new CSprite("HealCD2");
	HealCD2->CloneSprite("HealCD");
	HealCD2->SetSpritePosition(44.375,11.25);
	InfoBox.push_back(HealCD2);

	CSprite* SpeedCD1 = new CSprite("SpeedCD1");
	SpeedCD1->CloneSprite("SpeedCD");
	SpeedCD1->SetSpritePosition(-44.375,18.75);
	InfoBox.push_back(SpeedCD1);
	CSprite* SpeedCD2 = new CSprite("SpeedCD2");
	SpeedCD2->CloneSprite("SpeedCD");
	SpeedCD2->SetSpritePosition(44.375,18.75);
	InfoBox.push_back(SpeedCD2);
}