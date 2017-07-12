/////////////////////////////////////////////////////////////////////////////////
//
//
//
//
/////////////////////////////////////////////////////////////////////////////////
#ifndef _LESSON_X_H_
#define _LESSON_X_H_
//
#include <Windows.h>
#include "Map.h"
#include "Weapon.h"
#include "TankPlayer.h"
#include "TankPlayer1.h"
#include "TankPlayer2.h"
#include "TankEnemy.h"
#include "Bullet.h"
#include <vector>
using namespace std;
/////////////////////////////////////////////////////////////////////////////////
//
// 游戏总管类。负责处理游戏主循环、游戏初始化、结束等工作
class	CGameMain
{
private:
	int				m_iGameState;				// 游戏状态，0：结束或者等待开始；1：初始化；2：游戏进行中
	int 			m_iBulletNum;				// 子弹数目
	int 			m_iTankNum;					// 敌方坦克数目
	float 			m_fGameTime;				// 每局游戏总时间
	CTankPlayer1*   TankPlayer_Asuka;			// 明日香
	CTankPlayer2*   TankPlayer_Rei;				// 凌波丽
	vector<CTankEnemy*> EnemyBox;				// 敌方坦克盒子
	vector<CMap*> 	MapBox;						// 地图盒子
	vector<CBullet*> BulletBox;					// 子弹盒子
	vector<CAnimateSprite*> InfoBox;			// 信息盒子
	CSprite*		Hello;
	CSprite*		Play;
	CSprite*		Select;
	CSprite*		Level1;
	CSprite*		Level2;
	CSprite*		Return;
	bool			m_bFocu;
public:
	CGameMain();            //构造函数
	~CGameMain();           //析构函数  

	// Get方法
	int				GetGameState()											{ return m_iGameState; }
	
	// Set方法
	void			SetGameState( const int iState )				{ m_iGameState	=	iState; }
	
	// 游戏主循环等
	void			GameMainLoop( float	fDeltaTime );
	void			GameInit();
	void			GameRun( float fDeltaTime );
	void			GameEnd();
	void 			OnMouseMove( const float fMouseX, const float fMouseY );
	void 			OnMouseClick( const int iMouseType, const float fMouseX, const float fMouseY );
	void 			OnMouseUp( const int iMouseType, const float fMouseX, const float fMouseY );
	void 			OnKeyDown( const int iKey, const bool bAltPress, const bool bShiftPress, const bool bCtrlPress );
	void 			OnKeyUp( const int iKey );
	void 			OnSpriteColSprite( const char *szSrcName, const char *szTarName );
	void 			OnSpriteColWorldLimit( const char *szName, const int iColSide );
	// 游戏自用函数
	void			AddBullet( int iDir,float fPosX,float fPosY ,int iOwner,float fAttack);//添加子弹函数
	void 			AddEnemy(int round [][4]);//将敌人加入关卡
	void 			LoadGameMap(int map[][4], int num);//加载地图
	CMap* 			FindMapByName(const char* szName);//根据名字查找到地图
	CTankEnemy*		FindEnemyByName(const char* szName);//根据名字查找到敌人
	CBullet*		FindBulletByName(const char* szName);//根据名字查找到对象
	void 			ShowMeTheInfo(int num);//显示信息
	CAnimateSprite* FindCDByName(const char* szName);//根据名字查找到对象
	void 			AddMiss( int iDir,float fPosX,float fPosY ,int iOwner,float fAttack);//射出导弹
	void			TankGG();//敌方坦克死亡
	void 			HPLine();

};
//

/////////////////////////////////////////////////////////////////////////////////
// 
extern CGameMain	g_GameMain;

#endif // _LESSON_X_H_