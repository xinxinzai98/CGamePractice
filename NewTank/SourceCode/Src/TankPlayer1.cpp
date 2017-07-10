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

}

CTankPlayer1::~CTankPlayer1()
{

}
void CTankPlayer1::Init()
{
    SetMaxSpeed(10);
    SetSpritePosition(-20,0);
    SetSkillHealCD(5);
    SetTankState(1);
	SetAttack(20);
	SetTankBackLine(5);
	SetSpriteWorldLimit(WORLD_LIMIT_STICKY, -37.5, -37.5, 37.5, 37.5);
	SetSpriteCollisionActive(1,1);//设置为可以接受和发生碰撞
	SetFireCD(1.0);
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
        }
}