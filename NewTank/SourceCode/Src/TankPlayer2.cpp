// TankPlayer2.cpp: implementation of the CTankPlayer2 class.
//
//////////////////////////////////////////////////////////////////////

#include "TankPlayer2.h"
#include "LessonX.h"

//////////////////////////////////////////////////////////////////////
// Construction/Destruction
//////////////////////////////////////////////////////////////////////

CTankPlayer2::CTankPlayer2(const char* szname):CTankPlayer(szname)
{
	m_fTPCD = 5;
	m_bTPState = true;
	m_fTPTime = 0;
	m_fTPLine = 7.5;
	m_fMissCD = 3;
	m_fMissTIme = 0;
	m_bMissState = true;
	m_bMissAttack = 100;
}

CTankPlayer2::~CTankPlayer2()
{

}

void CTankPlayer2::Init()
{
	SetHp(100);
    SetMaxSpeed(10);
    SetSpritePosition(30,0);
    SetTankState(1);
	SetAttack(20);
	SetTankBackLine(5);
	SetSpriteWorldLimit(WORLD_LIMIT_STICKY, -37.5, -37.5, 37.5, 37.5);
	SetSpriteCollisionActive(1,1);//设置为可以接受和发生碰撞
}
void CTankPlayer2::OnMove(int iKey, bool bPress)
{
	if (GetTanksLife()){
	if(bPress==true&&GetTankState()==1)
		{
			switch (iKey)
			{
				case KEY_UP:
					SetDir(2);
					SetSpeedX(0);
					SetSpeedY(-GetMaxSpeed());
                    AnimateSpritePlayAnimation("TankPlayerRei_MW",false);
					break;
				case KEY_RIGHT:
					SetDir(3);
					SetSpeedX(GetMaxSpeed());
					SetSpeedY(0);
                    SetSpriteFlipX(true);
                    AnimateSpritePlayAnimation("TankPlayerRei_MA",false);
					break;
				case KEY_DOWN:
					SetDir(4);
					SetSpeedX(0);
					SetSpeedY(GetMaxSpeed());
                    AnimateSpritePlayAnimation("TankPlayerRei_MS",false);
					break;
				case KEY_LEFT:
					SetDir(1);
					SetSpeedX(-GetMaxSpeed());
					SetSpeedY(0);
                    SetSpriteFlipX(false);
                    AnimateSpritePlayAnimation("TankPlayerRei_MA",false);
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
				case KEY_UP:
                    AnimateSpritePlayAnimation("TankPlayerRei_SW",false);
					break;
				case KEY_RIGHT:
                    SetSpriteFlipX(true);
                    AnimateSpritePlayAnimation("TankPlayerRei_SA",false);
					break;
				case KEY_DOWN:
                    AnimateSpritePlayAnimation("TankPlayerRei_SS",false);
					break;
				case KEY_LEFT:
                    SetSpriteFlipX(false);
                    AnimateSpritePlayAnimation("TankPlayerRei_SA",false);
					break;
			}
        }
	else if(GetTankState()==3)
		{
			switch (iKey)
			{
				case KEY_UP:
					SetDir(2);
					SetSpeedX(0);
					SetSpeedY(-GetMaxSpeed());
                    AnimateSpritePlayAnimation("TankSkillSpeadRei_W",false);
					break;
				case KEY_RIGHT:
					SetDir(3);
					SetSpeedX(GetMaxSpeed());
					SetSpeedY(0);
                    SetSpriteFlipX(true);
                    AnimateSpritePlayAnimation("TankSkillSpeadRei_A",false);
					break;
				case KEY_DOWN:
					SetDir(4);
					SetSpeedX(0);
					SetSpeedY(GetMaxSpeed());
                    AnimateSpritePlayAnimation("TankSkillSpeadRei_S",false);
					break;
				case KEY_LEFT:
					SetDir(1);
					SetSpeedX(-GetMaxSpeed());
					SetSpeedY(0);
                    SetSpriteFlipX(false);
                    AnimateSpritePlayAnimation("TankSkillSpeadRei_A",false);
					break;
			}
			SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
		}
	}
}
void CTankPlayer2::OnFire()
{
	if (GetTankState()==1&&GetFireState()==true&&GetTanksLife())
	{
		float x,y;
		x = GetSpritePositionX();
		y = GetSpritePositionY();
    	switch (GetDir())
        	{
            	case 2:
                	{
						AnimateSpritePlayAnimation("TankPlayerRei_FW",true);
						y=y-GetSpriteHeight()/2;
						break;
					}
				case 3:
        	        {
						SetSpriteFlipX(true);
            	    	AnimateSpritePlayAnimation("TankPlayerRei_FA",true);
						x=x+GetSpriteWidth()/2+1;
						y=y-0.5;	
						break;
					}
				case 4:
    	            {
						AnimateSpritePlayAnimation("TankPlayerRei_FS",true);
						y=y+GetSpriteHeight()/2;
						break;
					}
				case 1:
    	            {
						SetSpriteFlipX(false);
        	        	AnimateSpritePlayAnimation("TankPlayerRei_FA",true);
						x=x-GetSpriteWidth()/2-1;
						y=y-0.5;
						break;
					}
	        }
		g_GameMain.AddBullet(GetDir(),x,y,1,GetAttack());
		TankBack();
		SetFireState(false);
		g_GameMain.FindCDByName("FireCD2")->AnimateSpritePlayAnimation("FireCD_0",false);
	}
}
void CTankPlayer2::OnHeal()
{
    if (GetSkillHealState()&&GetTanksLife())
        {
			if (GetHp()>=80)
				SetHp(100);
			else
				SetHp(GetHp()+20);
            SetSkillHealState(false);
            SetTankState(2);
			switch (GetDir())
        	{
            	case 2:
                	{
						AnimateSpritePlayAnimation("TankSkillHealRei_W",true);
						break;
					}
				case 3:
        	        {
						SetSpriteFlipX(true);
            	    	AnimateSpritePlayAnimation("TankSkillHealRei_A",true);
						break;
					}
				case 4:
    	            {
						AnimateSpritePlayAnimation("TankSkillHealRei_S",true);
						break;
					}
				case 1:
    	            {
						SetSpriteFlipX(false);
        	        	AnimateSpritePlayAnimation("TankSkillHealRei_A",true);
						break;
					}
	        }
			g_GameMain.FindCDByName("HealCD2")->AnimateSpritePlayAnimation("HealCD_0",false);
        }
}
void CTankPlayer2::TankLoop(float fDeltaTime)
{
	IsDead();
	if (GetTanksLife()){
    if (GetTankState()==2||GetSkillHealState()==false)
        SetHealTime(GetHealTime()+fDeltaTime);
    if (GetHealTime()>=GetSkillHealPlayTime())
        SetTankState(1);
    if (GetHealTime()>=GetSkillHealCD())
        {
            SetHealTime(0);
            SetSkillHealState(true);
			g_GameMain.FindCDByName("HealCD2")->AnimateSpritePlayAnimation("HealCD_1",false);
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
				g_GameMain.FindCDByName("FireCD2")->AnimateSpritePlayAnimation("FireCD_1",false);
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
			g_GameMain.FindCDByName("SpeedCD2")->AnimateSpritePlayAnimation("SpeedCD_1",false);
        }
	if (m_bTPState==false)
		{
			m_fTPTime+=fDeltaTime;
			if (IsAnimateSpriteAnimationFinished())
				{
					flash();
				}
		}
	if (m_fTPTime>=m_fTPCD)
        {
            m_fTPTime = 0;
           	m_bTPState = true;
			g_GameMain.FindCDByName("TPCD")->AnimateSpritePlayAnimation("TP_1",false);
        }
	
	if (m_bMissState==false)
    {
        m_fMissTIme+=fDeltaTime;
        if (m_fMissTIme>m_fMissCD)
            {
                m_bMissState = true;
                m_fMissTIme=0;
				g_GameMain.FindCDByName("missCD")->AnimateSpritePlayAnimation("Missile_1",false);
            }
    }
	}
}
void CTankPlayer2::Speed()
{
	if (GetSpeedState()&&GetTanksLife())
		{
			SetSpeedState(false);
			SetMaxSpeed(20);
			SetTankState(3);
			g_GameMain.FindCDByName("SpeedCD2")->AnimateSpritePlayAnimation("SpeedCD_0",false);
		}
}
void CTankPlayer2::TP()
{
	if (m_bTPState&&GetTanksLife())
		{
			m_bTPState = false;
			AnimateSpritePlayAnimation("TP",false);
			g_GameMain.FindCDByName("TPCD")->AnimateSpritePlayAnimation("TP_0",false);
		}
}
void CTankPlayer2::flash()
{
	float x,y;
	x = GetSpritePositionX();
	y = GetSpritePositionY();
	switch (GetDir())
        	{
            	case 2:
                	{
						y = y - m_fTPLine;
						break;
					}
				case 3:
        	        {
						x = x + m_fTPLine;
						break;
					}
				case 4:
    	            {
						y = y + m_fTPLine;
						break;
					}
				case 1:
    	            {
						x = x - m_fTPLine;
						break;
					}
	        }
	SetSpritePosition(x,y);
	AnimateSpritePlayAnimation("TP",true);	
}
void CTankPlayer2::Miss()
{
	if (m_bMissState&&GetTanksLife())
		{
			m_bMissState = false;
			float x,y;
			x = GetSpritePositionX();
			y = GetSpritePositionY();
    		switch (GetDir())
        	{
            	case 2:
                	{
						AnimateSpritePlayAnimation("TankPlayerRei_FW",true);
						y=y-GetSpriteHeight()/2;
						break;
					}
				case 3:
        	        {
						SetSpriteFlipX(true);
            	    	AnimateSpritePlayAnimation("TankPlayerRei_FA",true);
						x=x+GetSpriteWidth()/2+1;
						y=y-0.5;	
						break;
					}
				case 4:
    	            {
						AnimateSpritePlayAnimation("TankPlayerRei_FS",true);
						y=y+GetSpriteHeight()/2;
						break;
					}
				case 1:
    	            {
						SetSpriteFlipX(false);
        	        	AnimateSpritePlayAnimation("TankPlayerRei_FA",true);
						x=x-GetSpriteWidth()/2-1;
						y=y-0.5;
						break;
					}
	        }
			g_GameMain.AddMiss(GetDir(),x,y,1,m_bMissAttack);
			TankBack();
			g_GameMain.FindCDByName("missCD")->AnimateSpritePlayAnimation("Missile_0",false);
		}
}