// TankPlayer1.cpp: implementation of the CTankPlayer1 class.
//
//////////////////////////////////////////////////////////////////////

#include "TankPlayer1.h"

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
    SetSpritePosition(0,0);
    SetSkillHealCD(5);
    SetTankState(1);
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
					SetDir(4);
					SetSpeedX(GetMaxSpeed());
					SetSpeedY(0);
                    SetSpriteFlipX(true);
                    AnimateSpritePlayAnimation("TankPlayerAsuka_MA",false);
					break;
				case KEY_S:
					SetDir(3);
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
    switch (GetDir()&&GetTankState()==1)
        {
            case 2:
                AnimateSpritePlayAnimation("TankPlayerAsuka_FW",true);
				break;
			case 4:
                SetSpriteFlipX(true);
                AnimateSpritePlayAnimation("TankPlayerAsuka_FA",true);
				break;
			case 3:
                AnimateSpritePlayAnimation("TankPlayerAsuka_FS",true);
				break;
			case 1:
                SetSpriteFlipX(false);
                AnimateSpritePlayAnimation("TankPlayerAsuka_FA",true);
				break;
        }
}
