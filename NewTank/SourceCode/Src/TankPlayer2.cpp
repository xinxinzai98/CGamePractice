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

}

CTankPlayer2::~CTankPlayer2()
{

}

void CTankPlayer2::Init()
{
    SetMaxSpeed(10);
    SetSpritePosition(40,0);
    SetSkillHealCD(5);
    SetTankState(1);
	SetAttack(20);
	SetTankBackLine(5);
}
void CTankPlayer2::OnMove(int iKey, bool bPress)
{
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
}
void CTankPlayer2::OnFire()
{
	if (GetTankState()==1)
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
	}
}
void CTankPlayer2::OnHeal()
{
    if (GetSkillHealState())
        {
            SetSkillHealState(false);
            SetTankState(2);
			switch (GetDir())
        	{
            	case 2:
                	{
						AnimateSpritePlayAnimation("TankSkillHealRei_A",true);
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
						AnimateSpritePlayAnimation("TankSkillHealRei_A",true);
						break;
					}
				case 1:
    	            {
						SetSpriteFlipX(false);
        	        	AnimateSpritePlayAnimation("TankSkillHealRei_A",true);
						break;
					}
	        }
        }
}