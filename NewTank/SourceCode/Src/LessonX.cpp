/////////////////////////////////////////////////////////////////////////////////
//
//
//
//
/////////////////////////////////////////////////////////////////////////////////
#include <Stdio.h>
#include "CommonClass.h"
#include "LessonX.h"
#include "MapVT.h"
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
	m_iTankNum				=	0;
	Hello					=   new CSprite("Hello");
	Play					=	new CSprite("play");
	Select					=	new CSprite("select");
	Level1					=	new CSprite("Level1");
	Level2					=	new CSprite("Level2");
	Return					=	new CSprite("return");
	m_bFocu					=	false;
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
int Round_1[5][4]=
{
	{1,0,6,0},{2,2,9,0},{1,7,9,0},{2,9,6,0},{0,0,0,0}
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

	case 0:	// ��Ϸ����/�ȴ����ո����ʼ
	default:
		break;
	};
}
//=============================================================================
//
// ÿ�ֿ�ʼǰ���г�ʼ���������һ���������
void CGameMain::GameInit()
{
	//Level1->SetSpriteVisible(false);
	/*if ( GetGameState()==0)
		{
			Select->SetSpriteVisible(false);
			Level1->SetSpriteVisible(false);
			Level2->SetSpriteVisible(false);
			Return->SetSpriteVisible(false);
			//Hello->SetSpriteVisible(true);
			//Play->SetSpriteVisible(true);
		}
	else if ( GetGameState()==1)
		{
			Hello->SetSpriteVisible(false);
			Play->SetSpriteVisible(false);
			Select->SetSpriteVisible(false);
			Level1->SetSpriteVisible(true);
			Level2->SetSpriteVisible(true);
			Return->SetSpriteVisible(true);
		}*/
	TankPlayer_Asuka->Init();
	TankPlayer_Rei->Init();
	AddEnemy(Round_1);
	LoadGameMap(Map_1,1);
	ShowMeTheInfo(1);
	m_iTankNum = EnemyBox.size();
}
//=============================================================================
//
// ÿ����Ϸ������
void CGameMain::GameRun( float fDeltaTime )
{
	m_fGameTime+=fDeltaTime;
	if (TankPlayer_Asuka->GetTanksLife())
		TankPlayer_Asuka->TankLoop(fDeltaTime);
	if (TankPlayer_Rei->GetTanksLife())
		TankPlayer_Rei->TankLoop(fDeltaTime);
	//���˳���
	HPLine();//Ѫ��
	for (int i=0;i<EnemyBox.size();i++)
		{
			if (EnemyBox[i]->GetEnemyBornTime()<=m_fGameTime&&EnemyBox[i]->GetEnemyBorn()==false)
				{
					EnemyBox[i]->Born();
				}
		}
	for (i=0;i<EnemyBox.size();i++)
		{
			if (EnemyBox[i]->GetEnemyBorn()==true&&EnemyBox[i]->GetTanksLife())
				{
					EnemyBox[i]->Loop(fDeltaTime);
				}
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
	if (GetGameState()==0&&Play->IsPointInSprite(fMouseX,fMouseY)&&m_bFocu==false)
		{
			m_bFocu=true;
			Play->SetSpriteWidth(Play->GetSpriteWidth()*1.2);
			Play->SetSpriteHeight(Play->GetSpriteHeight()*1.2);
		}
	if (GetGameState()==0&&!Play->IsPointInSprite(fMouseX,fMouseY)&&m_bFocu==true)
		{
			m_bFocu=false;
			Play->SetSpriteWidth(Play->GetSpriteWidth()/1.2);
			Play->SetSpriteHeight(Play->GetSpriteHeight()/1.2);
		}
}
//==========================================================================
//
// �����
// ���� iMouseType����갴��ֵ���� enum MouseTypes ����
// ���� fMouseX, fMouseY��Ϊ��굱ǰ����
void CGameMain::OnMouseClick( const int iMouseType, const float fMouseX, const float fMouseY )
{
	if (GetGameState()==0&&Play->IsPointInSprite(fMouseX,fMouseY)&&m_bFocu==true&&iMouseType==0)
		{
			Play->SetSpriteWidth(Play->GetSpriteWidth()/1.2);
			Play->SetSpriteHeight(Play->GetSpriteHeight()/1.2);
		}
}
//==========================================================================
//
// ��굯��
// ���� iMouseType����갴��ֵ���� enum MouseTypes ����
// ���� fMouseX, fMouseY��Ϊ��굱ǰ����
void CGameMain::OnMouseUp( const int iMouseType, const float fMouseX, const float fMouseY )
{
	if (GetGameState()==0&&Play->IsPointInSprite(fMouseX,fMouseY)&&m_bFocu==true&&iMouseType==0)
		{
			SetGameState(1);
		}
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
	if (iKey==KEY_DECIMAL)
		TankPlayer_Rei->OnHeal();
	if (iKey==KEY_Q)
		TankPlayer_Asuka->Speed();
	if (iKey==KEY_NUMPAD1)
		TankPlayer_Rei->Speed();
	if (iKey==KEY_Z)
		TankPlayer_Asuka->Trans();
	if (iKey==KEY_NUMPAD2)
		TankPlayer_Rei->TP();
	if (iKey==KEY_NUMPAD3)
		TankPlayer_Rei->Miss();
	if (iKey==KEY_X)
		TankPlayer_Asuka->Wudi();
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
	else if (strstr(szSrcName,"miss_")!=NULL)
		{
			if (strstr(szTarName,"Enemy_")!=NULL)
				{
					FindEnemyByName(szTarName)->OnColMiss(FindBulletByName(szSrcName)->GetAttack());
					FindBulletByName(szSrcName)->DeleteSprite();
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
void CGameMain::AddEnemy(int round[][4])
{
	for (int i=0;round[i][0];i++)
		{
			int enemyspecie= round[i][0];
			int bornplaceX = round[i][1];
			int bornplaceY = round[i][2];
			int borntime = round[i][3];
			char* szName = CSystem::MakeSpriteName("Enemy_",i);
			CTankEnemy* enemy = new CTankEnemy(szName);
			char* tmpName = CSystem::MakeSpriteName("Enemy",enemyspecie);
			enemy->CloneSprite(tmpName);
			enemy->SetEnemySpecies(enemyspecie);
			enemy->SetNewPosX(bornplaceX);
			enemy->SetNewPosY(bornplaceY);
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
	for (int i=0;map[i][3];i++)
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
// ��ʾ��Ϣ
// ���� num: �ؿ�
void CGameMain::ShowMeTheInfo(int num)
{
	char * mapname = CSystem::MakeSpriteName("MapCover_",num);
	CAnimateSprite* MapCover =new CAnimateSprite("MapCover");
	MapCover->CloneSprite(mapname);
	MapCover->SetSpritePosition(0,0);
	InfoBox.push_back(MapCover);

	CAnimateSprite* FireCD1 = new CAnimateSprite("FireCD1");
	FireCD1->CloneSprite("FireCD");
	FireCD1->SetSpritePosition(-44.375,3.75);
	InfoBox.push_back(FireCD1);
	CAnimateSprite* FireCD2 = new CAnimateSprite("FireCD2");
	FireCD2->CloneSprite("FireCD");
	FireCD2->SetSpritePosition(44.375,3.75);
	InfoBox.push_back(FireCD2);

	CAnimateSprite* HealCD1 = new CAnimateSprite("HealCD1");
	HealCD1->CloneSprite("HealCD");
	HealCD1->SetSpritePosition(-44.375,11.25);
	InfoBox.push_back(HealCD1);
	CAnimateSprite* HealCD2 = new CAnimateSprite("HealCD2");
	HealCD2->CloneSprite("HealCD");
	HealCD2->SetSpritePosition(44.375,11.25);
	InfoBox.push_back(HealCD2);

	CAnimateSprite* SpeedCD1 = new CAnimateSprite("SpeedCD1");
	SpeedCD1->CloneSprite("SpeedCD");
	SpeedCD1->SetSpritePosition(-44.375,18.75);
	InfoBox.push_back(SpeedCD1);
	CAnimateSprite* SpeedCD2 = new CAnimateSprite("SpeedCD2");
	SpeedCD2->CloneSprite("SpeedCD");
	SpeedCD2->SetSpritePosition(44.375,18.75);
	InfoBox.push_back(SpeedCD2);

	CAnimateSprite* TransCD = new CAnimateSprite("TranCD");
	TransCD->CloneSprite("TransCD");
	TransCD->SetSpritePosition(-44.375,26.25);
	InfoBox.push_back(TransCD);

	CAnimateSprite* TPCD = new CAnimateSprite("TPCD");
	TPCD->CloneSprite("TPCD");
	TPCD->SetSpritePosition(44.375,26.25);
	InfoBox.push_back(TPCD);
	
	CAnimateSprite* MissCD = new CAnimateSprite("missCD");
	MissCD->CloneSprite("missCD");
	MissCD->SetSpritePosition(44.375,33.75);
	InfoBox.push_back(MissCD);

	CAnimateSprite* WudiCD = new CAnimateSprite("wudiCD");
	WudiCD->CloneSprite("wudiCD");
	WudiCD->SetSpritePosition(-44.375,33.75);
	InfoBox.push_back(WudiCD);
}
//===========================================================================
//
// �ҵ���ʾ��
CAnimateSprite* CGameMain::FindCDByName(const char* szName)//�������ֲ��ҵ�����
{
	for(int i=0; i<InfoBox.size(); i++)
	{
			if(strcmp(szName,InfoBox[i]->GetName())==0)
			{
				return InfoBox[i];
			}
	}
	return NULL;
}

//===========================================================================
//
// ����ӵ�����
// ���� iDir���ӵ�����
// ���� fPosX,fPosY: �ӵ���ʼλ��
// ���� iOwner: �ӵ�����
void CGameMain::AddMiss( int iDir,float fPosX,float fPosY ,int iOwner,float fAttack)
{
	char* szName = CSystem::MakeSpriteName("miss_",m_iBulletNum);//�����ӵ�����
	CBullet* pBullet = new CBullet(szName);
	pBullet->CloneSprite("miss");
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
// �з�̹������
void CGameMain::TankGG()
{
	m_iTankNum--;
}
//===========================================================================
//
// ��ʾѪ��
void CGameMain::HPLine()
{
	float X1 = TankPlayer_Asuka->GetSpritePositionX()-TankPlayer_Asuka->GetSpriteHeight()/2;
	float Y1 = TankPlayer_Asuka->GetSpritePositionY()-TankPlayer_Asuka->GetSpriteHeight()/2-0.5;
	CSystem::DrawRect(X1,Y1,X1+TankPlayer_Asuka->GetSpriteHeight(),Y1+0.5,1,0,255,255,255,255);
	CSystem::DrawLine(X1,Y1+0.25,X1+TankPlayer_Asuka->GetSpriteHeight()*TankPlayer_Asuka->GetHp()/100,Y1+0.25,3,0,255,0,0,255);

	float X2 = TankPlayer_Rei->GetSpritePositionX()-TankPlayer_Rei->GetSpriteHeight()/2;
	float Y2 = TankPlayer_Rei->GetSpritePositionY()-TankPlayer_Rei->GetSpriteHeight()/2-0.5;
	CSystem::DrawRect(X2,Y2,X2+TankPlayer_Rei->GetSpriteHeight(),Y2+0.5,1,0,255,255,255,255);
	CSystem::DrawLine(X2,Y2+0.25,X2+TankPlayer_Rei->GetSpriteHeight()*TankPlayer_Rei->GetHp()/100,Y2+0.25,3,0,255,0,0,255);
}
