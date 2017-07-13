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
// ��Ϸ�ܹ��ࡣ��������Ϸ��ѭ������Ϸ��ʼ���������ȹ���
class	CGameMain
{
private:
	int				m_iGameState;				// ��Ϸ״̬��0���������ߵȴ���ʼ��1����ʼ����2����Ϸ������
	int 			m_iBulletNum;				// �ӵ���Ŀ
	int 			m_iTankNum;					// �з�̹����Ŀ
	float 			m_fGameTime;				// ÿ����Ϸ��ʱ��
	CTankPlayer1*   TankPlayer_Asuka;			// ������
	CTankPlayer2*   TankPlayer_Rei;				// �貨��
	vector<CTankEnemy*> EnemyBox;				// �з�̹�˺���
	vector<CMap*> 	MapBox;						// ��ͼ����
	vector<CBullet*> BulletBox;					// �ӵ�����
	vector<CAnimateSprite*> InfoBox;			// ��Ϣ����
	CSprite*		Hello;
	CSprite*		Play;
	CSprite*		Select;
	CSprite*		Level1;
	CSprite*		Level2;
	CSprite*		Return;
	bool			m_bFocu;
public:
	CGameMain();            //���캯��
	~CGameMain();           //��������  

	// Get����
	int				GetGameState()											{ return m_iGameState; }
	
	// Set����
	void			SetGameState( const int iState )				{ m_iGameState	=	iState; }
	
	// ��Ϸ��ѭ����
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
	// ��Ϸ���ú���
	void			AddBullet( int iDir,float fPosX,float fPosY ,int iOwner,float fAttack);//����ӵ�����
	void 			AddEnemy(int round [][4]);//�����˼���ؿ�
	void 			LoadGameMap(int map[][4], int num);//���ص�ͼ
	CMap* 			FindMapByName(const char* szName);//�������ֲ��ҵ���ͼ
	CTankEnemy*		FindEnemyByName(const char* szName);//�������ֲ��ҵ�����
	CBullet*		FindBulletByName(const char* szName);//�������ֲ��ҵ�����
	void 			ShowMeTheInfo(int num);//��ʾ��Ϣ
	CAnimateSprite* FindCDByName(const char* szName);//�������ֲ��ҵ�����
	void 			AddMiss( int iDir,float fPosX,float fPosY ,int iOwner,float fAttack);//�������
	void			TankGG();//�з�̹������
	void 			HPLine();

};
//

/////////////////////////////////////////////////////////////////////////////////
// 
extern CGameMain	g_GameMain;

#endif // _LESSON_X_H_