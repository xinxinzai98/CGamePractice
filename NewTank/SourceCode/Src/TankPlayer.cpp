// TankPlayer.cpp: implementation of the CTankPlayer class.
//
//////////////////////////////////////////////////////////////////////

#include "TankPlayer.h"

//////////////////////////////////////////////////////////////////////
// Construction/Destruction
//////////////////////////////////////////////////////////////////////

CTankPlayer::CTankPlayer(const char* szname):CWeapon(szname)
{
    m_fSkillHealCD = 20.0;
    m_fMaxSpeed = 0.f;
    m_iTankState = 0;
    m_fHealTime = 0.f;
    m_bSkillHealState = true;
    m_fSkillHealPlayTime = 2.f; 
    m_fCHangeColorTime = 0;
    m_bFireState = true;
    m_fFireTime = 0;
    m_fSpeedTime = 0;
    m_bSpeedState = true;
    m_fSpeedCCTime = 3.0;
    m_fFireCD = 1.0;
    m_fSpeedCD = 15.0;
    m_fSpeedCCTime = 10.0;
    m_fMaxHP = 100;
    m_bTanksLife = true;
}

CTankPlayer::~CTankPlayer()
{
}
void CTankPlayer::TankBack()
{
    float x =  GetSpritePositionX();
    float y =  GetSpritePositionY();
    switch(GetDir())
        {
            case 2:
                y = y + GetTankBackLine();
                break;
            case 3:
                x = x - GetTankBackLine();
                break;
            case 4:
                y = y - GetTankBackLine();
                break;
            case 1:
                x = x + GetTankBackLine();
                break;
        }
    SpriteMoveTo(x,y,50,true);
}
void CTankPlayer::OnColMap(int tanktrans)
{
    if (tanktrans==0)
        {
            SetSpeedX(0);
            SetSpeedY(0);
            SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
        }
}
void CTankPlayer::OnColTank()
{
    SetSpeedX(0);
    SetSpeedY(0);
    SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
}
void CTankPlayer::OnColBullet(int owner,float attack)
{
    if (owner==0&&GetTankState()!=5)
        {
            SetHp(GetHp()-attack);
            SetSpriteColorGreen(120);
            SetSpriteColorBlue(120);
        }
}
void CTankPlayer::IsDead()
{
    if (GetHp()<1)
        {
            m_bTanksLife = false;
            AnimateSpritePlayAnimation("Boom",false);
            SetSpriteLinearVelocity(0,0);
            SetSpriteCollisionActive(0,0);
        }
}