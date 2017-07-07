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
// ����ĳ�������Ϊ��GameMainLoop����Ϊ��ѭ��������������ÿ֡ˢ����Ļͼ��֮�󣬶��ᱻ����һ�Ρ�

//==============================================================================
//
// ���캯��
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
// ��������
CGameMain::~CGameMain()
{
}
//=============================================================================
//
// ��Ϸ�ؿ�
// ��1�� ̹������ ��2��̹��λ�� ��3��̹�˳���ʱ��
int Round_1[2][3]=
{
	{1,2,3},{1,1,3}
};

//=============================================================================
//
// ��Ϸ��ͼ
// [0] X���� [1] Y���� [2] ��ͼ��� [3] ��ͼ����  
int Map_1[3][4]=
{
	{0,0,1,1},
	{4,5,18,2},
	{4,5,54,1}
};


//==============================================================================
//
// ��Ϸ��ѭ�����˺���������ͣ�ĵ��ã�����ÿˢ��һ����Ļ���˺�����������һ��
// ���Դ�����Ϸ�Ŀ�ʼ�������С������ȸ���״̬. 
// ��������fDeltaTime : �ϴε��ñ��������˴ε��ñ�������ʱ��������λ����
void CGameMain::GameMainLoop( float	fDeltaTime )
{
	switch( GetGameState() )
	{
		// ��ʼ����Ϸ�������һ���������
	case 1:
		{
			GameInit();
			SetGameState(2); // ��ʼ��֮�󣬽���Ϸ״̬����Ϊ������
		}
		break;

		// ��Ϸ�����У����������Ϸ�߼�
	case 2:
		{
			// TODO �޸Ĵ˴���Ϸѭ�������������ȷ��Ϸ�߼�
			if( true )
			{
				GameRun( fDeltaTime );
			}
			else // ��Ϸ������������Ϸ���㺯����������Ϸ״̬�޸�Ϊ����״̬
			{				
				SetGameState(0);
				GameEnd();
			}
		}
		break;

		// ��Ϸ����/�ȴ����ո����ʼ
	case 0:
	default:
		break;
	};
}
//=============================================================================
//
// ÿ�ֿ�ʼǰ���г�ʼ���������һ���������
void CGameMain::GameInit()
{
	TankPlayer_Asuka->Init();
	TankPlayer_Rei->Init();
	AddEnemy(Round_1);
	LoadGameMap(Map_1,1);
}
//=============================================================================
//
// ÿ����Ϸ������
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
// ������Ϸ����
void CGameMain::GameEnd()
{
}
//==========================================================================
//
// ����ƶ�
// ���� fMouseX, fMouseY��Ϊ��굱ǰ����
void CGameMain::OnMouseMove( const float fMouseX, const float fMouseY )
{
	
}
//==========================================================================
//
// �����
// ���� iMouseType����갴��ֵ���� enum MouseTypes ����
// ���� fMouseX, fMouseY��Ϊ��굱ǰ����
void CGameMain::OnMouseClick( const int iMouseType, const float fMouseX, const float fMouseY )
{
	
}
//==========================================================================
//
// ��굯��
// ���� iMouseType����갴��ֵ���� enum MouseTypes ����
// ���� fMouseX, fMouseY��Ϊ��굱ǰ����
void CGameMain::OnMouseUp( const int iMouseType, const float fMouseX, const float fMouseY )
{
	
}
//==========================================================================
//
// ���̰���
// ���� iKey�������µļ���ֵ�� enum KeyCodes �궨��
// ���� iAltPress, iShiftPress��iCtrlPress�������ϵĹ��ܼ�Alt��Ctrl��Shift��ǰ�Ƿ�Ҳ���ڰ���״̬(0δ���£�1����)
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
// ���̵���
// ���� iKey������ļ���ֵ�� enum KeyCodes �궨��
void CGameMain::OnKeyUp( const int iKey )
{
	TankPlayer_Asuka->OnMove(iKey,false);
	TankPlayer_Rei->OnMove(iKey,false);
}
//===========================================================================
//
// �����뾫����ײ
// ���� szSrcName��������ײ�ľ�������
// ���� szTarName������ײ�ľ�������
void CGameMain::OnSpriteColSprite( const char *szSrcName, const char *szTarName )
{
	
}
//===========================================================================
//
// ����������߽���ײ
// ���� szName����ײ���߽�ľ�������
// ���� iColSide����ײ���ı߽� 0 ��ߣ�1 �ұߣ�2 �ϱߣ�3 �±�
void CGameMain::OnSpriteColWorldLimit( const char *szName, const int iColSide )
{
	
}
//===========================================================================
//
// ����ӵ�����
// ���� iDir���ӵ�����
// ���� fPosX,fPosY: �ӵ���ʼλ��
// ���� iOwner: �ӵ�����
void CGameMain::AddBullet( int iDir,float fPosX,float fPosY ,int iOwner,float fAttack)
{
	char* szName = CSystem::MakeSpriteName("Bullet",m_iBulletNum);//�����ӵ�����
	CBullet* pBullet = new CBullet(szName);
	pBullet->CloneSprite("Bullet");
	pBullet->SetSpritePosition(fPosX,fPosY);
	pBullet->SetSpriteCollisionSend(true); //���ý�����ײ
	pBullet->SetAttack(fAttack);
	pBullet->OnMove(iDir);
	m_iBulletNum++; //�ӵ�������1
	if(iOwner == 1)
		{
			pBullet->SetOwner(1);//1��ʾ�ҷ�̹�˷�����ӵ�
		}
	else
		{
			pBullet->SetOwner(0); //0��ʾ�з�̹�˷�����ӵ�
		}
}
//===========================================================================
//
// �����˼���ؿ�
// ���� round: �ؿ�
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
// ���ص�ͼ
// ���� map: ��ͼ
// ���� num���ؿ����
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