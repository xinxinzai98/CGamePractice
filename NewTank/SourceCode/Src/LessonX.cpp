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
	TankPlayer_Asuka 		= 	new CTankPlayer1("Asuka");
	TankPlayer_Rei 			= 	new CTankPlayer2("Rei");
	m_fGameTime				=	0;
	timeb					=	new CTextSprite("test");
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
// 【1】 坦克种类 【2】坦克位置 【3】坦克出现时间
int Round_1[2][3]=
{
	{1,2,3},{1,1,3}
};

//=============================================================================
//
// 游戏地图
// [0] X坐标 [1] Y坐标 [2] 贴图编号 [3] 贴图性质  
int Map_1[3][4]=
{
	{0,0,1,1},
	{4,5,18,2},
	{4,5,54,1}
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
}
//=============================================================================
//
// 每局游戏进行中
void CGameMain::GameRun( float fDeltaTime )
{
	m_fGameTime+=fDeltaTime;
	TankPlayer_Asuka->TankLoop(fDeltaTime);
	TankPlayer_Rei->TankLoop(fDeltaTime);
	
	for (int i=0;i<WeaponBox.size();i++)
		{
			if (WeaponBox[i]->GetEnemyBornTime()!=0&&WeaponBox[i]->GetEnemyBornTime()<=m_fGameTime)
				WeaponBox[i]->Born();
		}
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
	else if (iKey==KEY_UP||iKey==KEY_DOWN||iKey==KEY_RIGHT||iKey==KEY_LEFT)
		TankPlayer_Rei->OnMove(iKey,true);
	else if (iKey==KEY_SPACE)
		TankPlayer_Asuka->OnFire();
	else if (iKey==KEY_NUMPAD0)
		TankPlayer_Rei->OnFire();
	/*else if (iKey==KEY_E)
		{
			TankPlayer_Asuka->OnHeal();
		}*/
}
//==========================================================================
//
// 键盘弹起
// 参数 iKey：弹起的键，值见 enum KeyCodes 宏定义
void CGameMain::OnKeyUp( const int iKey )
{
	TankPlayer_Asuka->OnMove(iKey,false);
	TankPlayer_Rei->OnMove(iKey,false);
}
//===========================================================================
//
// 精灵与精灵碰撞
// 参数 szSrcName：发起碰撞的精灵名字
// 参数 szTarName：被碰撞的精灵名字
void CGameMain::OnSpriteColSprite( const char *szSrcName, const char *szTarName )
{
	
}
//===========================================================================
//
// 精灵与世界边界碰撞
// 参数 szName：碰撞到边界的精灵名字
// 参数 iColSide：碰撞到的边界 0 左边，1 右边，2 上边，3 下边
void CGameMain::OnSpriteColWorldLimit( const char *szName, const int iColSide )
{
	
}
//===========================================================================
//
// 添加子弹函数
// 参数 iDir：子弹方向
// 参数 fPosX,fPosY: 子弹起始位置
// 参数 iOwner: 子弹归属
void CGameMain::AddBullet( int iDir,float fPosX,float fPosY ,int iOwner,float fAttack)
{
	char* szName = CSystem::MakeSpriteName("Bullet",m_iBulletNum);//创建子弹名字
	CBullet* pBullet = new CBullet(szName);
	pBullet->CloneSprite("Bullet");
	pBullet->SetSpritePosition(fPosX,fPosY);
	pBullet->SetSpriteCollisionSend(true); //设置接收碰撞
	pBullet->SetAttack(fAttack);
	pBullet->OnMove(iDir);
	m_iBulletNum++; //子弹个数加1
	if(iOwner == 1)
		{
			pBullet->SetOwner(1);//1表示我方坦克发射的子弹
		}
	else
		{
			pBullet->SetOwner(0); //0表示敌方坦克发射的子弹
		}
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
			char* szName = CSystem::MakeSpriteName("Enemy",i);
			CTankEnemy* enemy = new CTankEnemy(szName);
			char* tmpName = CSystem::MakeSpriteName("Enemy",enemyspecie);
			enemy->CloneSprite(tmpName);
			enemy->SetEnemySpecies(enemyspecie);
			enemy->SetEnemyPlace(bornplace);
			enemy->SetEnemtBornTime(borntime);
			WeaponBox.push_back(enemy);
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
	for (int i=0;map[i][3]!='\0';i++)
		{
			int px = map[i][0];
			int py = map[i][1];
			int chartnum = map[i][2];
			int chartproperty = map[i][3];
			char* szName = CSystem::MakeSpriteName(mapnum_1,i);
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