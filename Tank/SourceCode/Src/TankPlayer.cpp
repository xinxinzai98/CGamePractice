// TankPlayer.cpp: implementation of the CTankPlayer class.
//
//////////////////////////////////////////////////////////////////////

#include "TankPlayer.h"

//////////////////////////////////////////////////////////////////////
// Construction/Destruction
//////////////////////////////////////////////////////////////////////

CTankPlayer::CTankPlayer(const char* szname):CWeapon(szname)
{
    m_fSkillOneCD = 0.f;
	m_fSkillTwoCD = 0.f;
    m_fSkillHealCD = 0.f;
    m_fMaxSpeed = 0.f;
    m_iTankState = 0;
    m_fHealTime = 0.f;
    m_bSkillHealState = true;
    m_fSkillHealPlayTime = 2.f;
}

CTankPlayer::~CTankPlayer()
{

}
void CTankPlayer::OnHeal()
{
    if (GetSkillHealState())
        {
            SetSkillHealState(false);
            SetTankState(2);
        }
}
void CTankPlayer::TankLoop(float fDeltaTime)
{
    if (m_iTankState==2||m_bSkillHealState==false)
        m_fHealTime+=fDeltaTime;
    if (m_fHealTime>=m_fSkillHealPlayTime)
        SetTankState(1);
    if (m_fHealTime>=m_fSkillHealCD)
        {
            m_fHealTime = 0.f;
            SetSkillHealState(true);
        }
        
}