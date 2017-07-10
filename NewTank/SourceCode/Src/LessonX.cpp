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
	TankPlayer_Asuka 		= 	new CTankPlayer1("TankPlayer_Asuka");
	TankPlayer_Rei 			= 	new CTankPlayer2("TankPlayer_Rei");
	m_fGameTime				=	0;
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
// [0] ̹������ [1] ̹��λ��X [2] ̹��λ��Y [3]̹�˳���ʱ��
int Round_1[4][3]=
{
	{1,2,3},{2,1,3},{1,4,0},{2,3,3}
};

//=============================================================================
//
// ��Ϸ��ͼ
// [0] X���� [1] Y���� [2] ��ͼ��� [3] ��ͼ����
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
	ShowMeTheInfo(1);
}
//=============================================================================
//
// ÿ����Ϸ������
void CGameMain::GameRun( float fDeltaTime )
{
	m_fGameTime+=fDeltaTime;
	TankPlayer_Asuka->TankLoop(fDeltaTime);
	TankPlayer_Rei->TankLoop(fDeltaTime);
	
	//���˳���
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
	//����
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
// ���̵���
// ���� iKey������ļ���ֵ�� enum KeyCodes �궨��
void CGameMain::OnKeyUp( const int iKey )
{
	if(iKey==KEY_W||iKey==KEY_A||iKey==KEY_S||iKey==KEY_D)
		TankPlayer_Asuka->OnMove(iKey,false);
	if (iKey==KEY_UP||iKey==KEY_DOWN||iKey==KEY_RIGHT||iKey==KEY_LEFT)
		TankPlayer_Rei->OnMove(iKey,false);
}
//===========================================================================
//
// �����뾫����ײ
// ���� szSrcName��������ײ�ľ�������
// ���� szTarName������ײ�ľ�������
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
// ����������߽���ײ
// ���� szName����ײ���߽�ľ�������
// ���� iColSide����ײ���ı߽� 0 ��ߣ�1 �ұߣ�2 �ϱߣ�3 �±�
void CGameMain::OnSpriteColWorldLimit( const char *szName, const int iColSide )
{
	if (strstr(szName,"Enemy_")!=NULL)
		{
			FindEnemyByName(szName)->OnMove(CSystem::RandomRange(1,4));
		}
}
//===========================================================================
//
// ����ӵ�����
// ���� iDir���ӵ�����
// ���� fPosX,fPosY: �ӵ���ʼλ��
// ���� iOwner: �ӵ�����
void CGameMain::AddBullet( int iDir,float fPosX,float fPosY ,int iOwner,float fAttack)
{
	char* szName = CSystem::MakeSpriteName("Bullet_",m_iBulletNum);//�����ӵ�����
	CBullet* pBullet = new CBullet(szName);
	pBullet->CloneSprite("Bullet");
	pBullet->SetSpritePosition(fPosX,fPosY);
	pBullet->SetSpriteCollisionActive(1,0);//����Ϊ���Խ��ܺͷ�����ײ
	pBullet->SetAttack(fAttack);
	pBullet->OnMove(iDir);
	pBullet->SetSpriteWorldLimit(WORLD_LIMIT_KILL, -37.5, -37.5, 37.5, 37.5);
	m_iBulletNum++; //�ӵ�������1
	if(iOwner == 1)
		{
			pBullet->SetOwner(1);//1��ʾ�ҷ�̹�˷�����ӵ�
		}
	else
		{
			pBullet->SetOwner(0); //0��ʾ�з�̹�˷�����ӵ�
		}
	BulletBox.push_back(pBullet);
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
// ���ص�ͼ
// ���� map: ��ͼ
// ���� num���ؿ����
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
// �ҵ���ͼ
// ���� szName: ��ͼ����
CMap* CGameMain::FindMapByName(const char* szName)//�������ֲ��ҵ�����
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
// �ҵ�����
// ���� szname: ��������
CTankEnemy* CGameMain::FindEnemyByName(const char* szName)//�������ֲ��ҵ�����
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
// �ҵ��ӵ�
// ���� szname: �ӵ�����
CBullet* CGameMain::FindBulletByName(const char* szName)//�������ֲ��ҵ�����
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
// ��ʾ
// ���� num: �ؿ�
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