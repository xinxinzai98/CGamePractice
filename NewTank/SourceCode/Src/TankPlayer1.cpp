// TankPlayer1.cpp: implementation of the CTankPlayer1 class.
//
//////////////////////////////////////////////////////////////////////

#include "TankPlayer1.h"
#include "LessonX.h"
//////////////////////////////////////////////////////////////////////
// Construction/Destruction
//////////////////////////////////////////////////////////////////////

CTankPlayer1::CTankPlayer1(const char* szname):CTankPlayer(szname)
{
	m_fTransCD = 5;
	m_bTransState = true;
	m_fTransTime = 0;
	m_fTransCCTime = 2;
	m_fTranFireCount = 0;
}

CTankPlayer1::~CTankPlayer1()
{

}
void CTankPlayer1::Init()
{
    SetMaxSpeed(10);
    SetSpritePosition(-20,0);
    SetTankState(1);
	SetAttack(20);
	SetTankBackLine(5);
	SetSpriteWorldLimit(WORLD_LIMIT_STICKY, -37.5, -37.5, 37.5, 37.5);
	SetSpriteCollisionActive(1,1);//设置为可以接受和发生碰撞
}

void CTankPlayer1::OnMove(int iKey, bool bPress)
{
	if(bPress==true&&GetTankState()==1)
		{
			switch (iKey)
			{
				case KEY_W:
					SetDir(2);
					SetSpeedX(0);
					SetSpeedY(-GetMaxSpeed());
                    AnimateSpritePlayAnimation("TankPlayerAsuka_MW",false);
					break;
				case KEY_D:
					SetDir(3);
					SetSpeedX(GetMaxSpeed());
					SetSpeedY(0);
                    SetSpriteFlipX(true);
                    AnimateSpritePlayAnimation("TankPlayerAsuka_MA",false);
					break;
				case KEY_S:
					SetDir(4);
					SetSpeedX(0);
					SetSpeedY(GetMaxSpeed());
                    AnimateSpritePlayAnimation("TankPlayerAsuka_MS",false);
					break;
				case KEY_A:
					SetDir(1);
					SetSpeedX(-GetMaxSpeed());
					SetSpeedY(0);
                    SetSpriteFlipX(false);
                    AnimateSpritePlayAnimation("TankPlayerAsuka_MA",false);
					break;
			}
			SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
		}
	else if(bPress==false&&GetTankState()==1)
		{
			SetSpeedX(0);
			SetSpeedY(0);
			SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
            switch (iKey)
			{
				case KEY_W:
                    AnimateSpritePlayAnimation("TankPlayerAsuka_SW",false);
					break;
				case KEY_D:
                    SetSpriteFlipX(true);
                    AnimateSpritePlayAnimation("TankPlayerAsuka_SA",false);
					break;
				case KEY_S:
                    AnimateSpritePlayAnimation("TankPlayerAsuka_SS",false);
					break;
				case KEY_A:
                    SetSpriteFlipX(false);
                    AnimateSpritePlayAnimation("TankPlayerAsuka_SA",false);
					break;
			}
        }
	else if(GetTankState()==3)
		{
			switch (iKey)
			{
				case KEY_W:
					SetDir(2);
					SetSpeedX(0);
					SetSpeedY(-GetMaxSpeed());
                    AnimateSpritePlayAnimation("TankSkillSpeadAsuka_W",false);
					break;
				case KEY_D:
					SetDir(3);
					SetSpeedX(GetMaxSpeed());
					SetSpeedY(0);
                    SetSpriteFlipX(true);
                    AnimateSpritePlayAnimation("TankSkillSpeadAsuka_A",false);
					break;
				case KEY_S:
					SetDir(4);
					SetSpeedX(0);
					SetSpeedY(GetMaxSpeed());
                    AnimateSpritePlayAnimation("TankSkillSpeadAsuka_S",false);
					break;
				case KEY_A:
					SetDir(1);
					SetSpeedX(-GetMaxSpeed());
					SetSpeedY(0);
                    SetSpriteFlipX(false);
                    AnimateSpritePlayAnimation("TankSkillSpeadAsuka_A",false);
					break;
			}
			SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
		}
	else if(GetTankState()==4)
		{
			switch (iKey)
			{
				case KEY_W:
					SetDir(2);
					break;
				case KEY_D:
					SetDir(3);
					break;
				case KEY_S:
					SetDir(4);
					break;
				case KEY_A:
					SetDir(1);
					break;
			}
		}
}
void CTankPlayer1::OnFire()
{
	if (GetTankState()==1&&GetFireState()==true)
	{
		float x,y;
		x = GetSpritePositionX();
		y = GetSpritePositionY();
    	switch (GetDir())
        	{
            	case 2:
                	{
						AnimateSpritePlayAnimation("TankPlayerAsuka_FW",true);
						y=y-GetSpriteHeight()/2;
						break;
					}
				case 3:
        	        {
						SetSpriteFlipX(true);
            	    	AnimateSpritePlayAnimation("TankPlayerAsuka_FA",true);
						x=x+GetSpriteWidth()/2+1;
						y=y-0.5;	
						break;
					}
				case 4:
    	            {
						AnimateSpritePlayAnimation("TankPlayerAsuka_FS",true);
						y=y+GetSpriteHeight()/2;
						break;
					}
				case 1:
    	            {
						SetSpriteFlipX(false);
        	        	AnimateSpritePlayAnimation("TankPlayerAsuka_FA",true);
						x=x-GetSpriteWidth()/2-1;
						y=y-0.5;
						break;
					}
	        }
		g_GameMain.AddBullet(GetDir(),x,y,1,GetAttack());
		TankBack();
		SetFireState(false);
		g_GameMain.FindCDByName("FireCD1")->AnimateSpritePlayAnimation("FireCD_0",false);
	}
}
void CTankPlayer1::OnHeal()
{
    if (GetSkillHealState())
        {
            SetSkillHealState(false);
            SetTankState(2);
			SetSpeedX(0);
    		SetSpeedY(0);
    		SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
			switch (GetDir())
        	{
            	case 2:
                	{
						AnimateSpritePlayAnimation("TankSkillHealAsuka_W",true);
						break;
					}
				case 3:
        	        {
						SetSpriteFlipX(true);
            	    	AnimateSpritePlayAnimation("TankSkillHealAsuka_A",true);
						break;
					}
				case 4:
    	            {
						AnimateSpritePlayAnimation("TankSkillHealAsuka_S",true);
						break;
					}
				case 1:
    	            {
						SetSpriteFlipX(false);
        	        	AnimateSpritePlayAnimation("TankSkillHealAsuka_A",true);
						break;
					}
	        }
			g_GameMain.FindCDByName("HealCD1")->AnimateSpritePlayAnimation("HealCD_0",false);
        }
}
void CTankPlayer1::TankLoop(float fDeltaTime)
{
    if (GetTankState()==2||GetSkillHealState()==false)
        SetHealTime(GetHealTime()+fDeltaTime);
    if (GetHealTime()>=GetSkillHealPlayTime())
        SetTankState(1);
    if (GetHealTime()>=GetSkillHealCD())
        {
            SetHealTime(0);
            SetSkillHealState(true);
			g_GameMain.FindCDByName("HealCD1")->AnimateSpritePlayAnimation("HealCD_1",false);
        }
	
    if(GetSpriteColorGreen()!=255)
    {
        SetChangeColorTime(GetChangeColorTime()+fDeltaTime);
        if (GetChangeColorTime()>0.5)
        {
            SetChangeColorTime(0);
            SetSpriteColorGreen(255);
            SetSpriteColorBlue(255);
        }
    }

    if (GetFireState()==false)
    {
        SetFireTime(GetFireTime()+fDeltaTime);
        if (GetFireTime()>GetFireCD())
            {
                SetFireState(true);
                SetFireTime(0);
				g_GameMain.FindCDByName("FireCD1")->AnimateSpritePlayAnimation("FireCD_1",false);
            }
    }

	if (GetTankState()==3||GetSpeedState()==false)
        SetSpeedTime(GetSpeedTime()+fDeltaTime);
    if (GetSpeedTime()>=GetSpeedCCTime())
        {
			SetTankState(1);
			SetMaxSpeed(10);
		}
    if (GetSpeedTime()>=GetSpeedCD())
        {
            SetSpeedTime(0);
            SetSpeedState(true);
			g_GameMain.FindCDByName("SpeedCD1")->AnimateSpritePlayAnimation("SpeedCD_1",false);
        }

	
	if (GetTankState()==4||m_bTransState==false)
        {
			m_fTransTime+=fDeltaTime;
			m_fTranFireCount+=fDeltaTime;
			if(GetTankState()==4)
				{
					TransFire();
				}
		}
    if (m_fTransTime>=m_fTransCCTime)
        {
			SetTankState(1);

		}
    if (m_fTransTime>=m_fTransCD)
        {
           	m_fTransTime = 0;
            m_bTransState = true;
			g_GameMain.FindCDByName("TranCD")->AnimateSpritePlayAnimation("Trans_1",false);
        }
	
}
void CTankPlayer1::Speed()
{
	if (GetSpeedState())
		{
			SetSpeedState(false);
			SetMaxSpeed(20);
			SetTankState(3);
			g_GameMain.FindCDByName("SpeedCD1")->AnimateSpritePlayAnimation("SpeedCD_0",false);
		}
}
void CTankPlayer1::Trans()
{
	if (m_bTransState)
		{
			SetTankState(4);
			m_bTransState = false;
			g_GameMain.FindCDByName("TranCD")->AnimateSpritePlayAnimation("Trans_0",false);
		}
}
void CTankPlayer1::TransFire()
{
	float x1,y1,x2,y2;
	x1 = GetSpritePositionX();
	y1 = GetSpritePositionY();
	x2 = GetSpritePositionX();
	y2 = GetSpritePositionY();
	switch (GetDir())
        {
            case 2:
                {
					AnimateSpritePlayAnimation("Trans_W",true);
					y1=y1-GetSpriteHeight()/2;
					y2=y1;
					x1=x1-GetSpriteHeight()/2;
					x2=x2+GetSpriteHeight()/2;
					break;
				}
			case 3:
        	    {
					SetSpriteFlipX(true);
            	    AnimateSpritePlayAnimation("Trans_A",true);
					x1=x1+GetSpriteHeight()/2;
					x2=x1;
					y1=y1-GetSpriteHeight()/2;
					y2=y2+4.5;	
					break;
				}
			case 4:
    	        {
					AnimateSpritePlayAnimation("Trans_S",true);
					y1=y1+GetSpriteHeight()/2;
					y2=y1;
					x1=x1-GetSpriteHeight()/2;
					x2=x2+GetSpriteHeight()/2;
					break;
				}
			case 1:
    	        {
					SetSpriteFlipX(false);
        	   		AnimateSpritePlayAnimation("Trans_A",true);
					x1=x1-GetSpriteHeight()/2;
					x2=x1;
					y1=y1-GetSpriteHeight()/2;
					y2=y2+4.5;
					break;
				}
	        }
	g_GameMain.AddBullet(GetDir(),x1,y1,1,GetAttack());
	g_GameMain.AddBullet(GetDir(),x2,y2,1,GetAttack());
}